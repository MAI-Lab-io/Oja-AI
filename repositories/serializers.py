from rest_framework import serializers
from repositories.metadata import StrictSerializer
from .models import Repository
from releases.models import Release, SourceLink
from artifacts.models import Artifact
from datasets.metadata import DatasetMetadataSerializer
from datasets.split_files import validate_split_files
from models_catalog.metadata import ModelMetadataSerializer


def validate_metadata(kind, data, *, require_schema=False):
    if require_schema and kind == 'dataset' and isinstance(data, dict):
        missing = {'splits', 'features'} - set(data)
        if missing:
            raise serializers.ValidationError({key: 'This field is required. Use an empty object for splits or an empty list for features when not applicable.' for key in sorted(missing)})
    serializer = (ModelMetadataSerializer if kind == 'model' else DatasetMetadataSerializer)(data=data)
    serializer.is_valid(raise_exception=True)
    return serializer.validated_data


class RepositorySerializer(serializers.ModelSerializer):
    owner = serializers.CharField(source='owner.username', read_only=True)
    latest_release = serializers.SerializerMethodField()
    description = serializers.CharField(max_length=5000, allow_blank=False, required=True)

    class Meta:
        model = Repository
        fields = ['id', 'owner', 'kind', 'name', 'slug', 'description', 'visibility', 'download_count', 'created_at', 'latest_release']
        read_only_fields = ['id', 'created_at', 'download_count']

    def get_latest_release(self, instance):
        items = getattr(instance, 'published_summary', [])
        if not items:
            return None
        release = items[0]
        return {'id': str(release.pk), 'version': release.version, 'metadata': release.metadata,
                'published_at': release.published_at, 'file_count': release.summary_file_count,
                'total_size': release.summary_total_size or 0}

    def validate_slug(self, value):
        value = value.lower()
        query = Repository.objects.filter(owner=self.context['request'].user, slug__iexact=value)
        if self.instance:
            query = query.exclude(pk=self.instance.pk)
        if query.exists():
            raise serializers.ValidationError('You already have a repository with this name.')
        return value

    def validate(self, attrs):
        if self.instance and any(field in attrs and attrs[field] != getattr(self.instance, field) for field in ['kind', 'slug']):
            raise serializers.ValidationError('Repository type and slug are fixed at creation.')
        return attrs


class ArtifactSerializer(serializers.ModelSerializer):
    download_url = serializers.SerializerMethodField()

    class Meta:
        model = Artifact
        fields = ['id', 'path', 'declared_size', 'size', 'sha256', 'status', 'scan_status', 'validation_profile', 'validated_at', 'error', 'created_at', 'download_url']
        read_only_fields = fields

    def get_download_url(self, item):
        return f'/api/v1/artifacts/{item.pk}/download/' if item.status == 'ready' else None


class SourceSerializer(StrictSerializer):
    source = serializers.UUIDField()
    relation = serializers.ChoiceField(choices=['derived_from', 'trained_on'])

    def to_representation(self, instance):
        if isinstance(instance, SourceLink):
            return {'source': str(instance.source_id), 'relation': instance.relation}
        return super().to_representation(instance)


class ParentReleaseField(serializers.UUIDField):
    def get_attribute(self, instance):
        return instance.parent_id


class ReleaseSerializer(serializers.ModelSerializer):
    files = serializers.SerializerMethodField()
    sources = SourceSerializer(many=True, required=False, max_length=100)
    parent = ParentReleaseField(required=False, allow_null=True)

    class Meta:
        model = Release
        fields = ['id', 'repository', 'version', 'parent', 'status', 'metadata_schema', 'metadata', 'card', 'changelog', 'rights_confirmed', 'sources', 'files', 'manifest_sha256', 'created_at', 'published_at']
        read_only_fields = ['id', 'repository', 'status', 'metadata_schema', 'manifest_sha256', 'created_at', 'published_at']

    def to_representation(self, instance):
        # SourceSerializer accepts IDs on write, whereas the ORM stores relations.
        data = super().to_representation(instance)
        data['parent'] = str(instance.parent_id) if instance.parent_id else None
        data['sources'] = [{'source': str(link.source_id), 'relation': link.relation} for link in instance.sources.all()]
        return data

    def get_files(self, instance):
        return ArtifactSerializer([item for item in instance.files.all() if item.status != 'cancelled'], many=True).data

    def validate_version(self, value):
        import re
        if not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9._-]{0,79}', value):
            raise serializers.ValidationError('Use letters, numbers, dots, underscores or hyphens.')
        repository = self.context['repository']
        query = Release.objects.filter(repository=repository, version__iexact=value)
        if self.instance:
            query = query.exclude(pk=self.instance.pk)
        if query.exists():
            raise serializers.ValidationError('This version already exists.')
        return value

    def validate_metadata(self, value):
        if not value:
            raise serializers.ValidationError('Complete the required metadata fields.')
        return validate_metadata(self.context['repository'].kind, value, require_schema=True)

    def validate(self, attrs):
        # A new version may start as an empty draft. Saving its upload form must
        # validate the complete effective record, including partial API requests.
        if self.instance and set(attrs) & {'metadata', 'card', 'changelog', 'rights_confirmed', 'sources'}:
            errors = {}
            for field in ['card', 'changelog']:
                if not attrs.get(field, getattr(self.instance, field)).strip():
                    errors[field] = 'This field is required.'
            if attrs.get('rights_confirmed', self.instance.rights_confirmed) is not True:
                errors['rights_confirmed'] = 'You must confirm upload rights before saving.'
            try:
                value = validate_metadata(self.context['repository'].kind, attrs.get('metadata', self.instance.metadata), require_schema=True)
                if self.context['repository'].kind == 'dataset':
                    value = validate_split_files(value, self.instance)
                attrs['metadata'] = value
            except serializers.ValidationError as error:
                errors['metadata'] = error.detail
            if errors:
                raise serializers.ValidationError(errors)
        return attrs

    def validate_parent(self, value):
        if value is None:
            return None
        if not Release.objects.filter(pk=value, repository=self.context['repository'], status='published').exists():
            raise serializers.ValidationError('The parent must be a published version of this repository.')
        return value

    def validate_sources(self, values):
        from django.db.models import Q
        from rest_framework.exceptions import ValidationError
        ids = [item['source'] for item in values]
        visible = Release.objects.filter(pk__in=ids, status='published').filter(Q(repository__visibility='public') | Q(repository__owner=self.context['request'].user))
        sources = {item.pk: item for item in visible.select_related('repository')}
        if len(set(ids)) != len(sources):
            raise ValidationError('Sources must be accessible published release IDs.')
        for item in values:
            if item['relation'] == 'trained_on' and (self.context['repository'].kind != 'model' or sources[item['source']].repository.kind != 'dataset'):
                raise ValidationError('trained_on links must connect a model to a dataset release.')
            if self.context['repository'].visibility == 'public' and sources[item['source']].repository.visibility != 'public':
                raise ValidationError('Public releases cannot disclose private source releases.')
        if len({(x['source'], x['relation']) for x in values}) != len(values):
            raise ValidationError('Duplicate provenance links are not allowed.')
        return values

    def create(self, validated_data):
        sources = validated_data.pop('sources', [])
        parent = validated_data.pop('parent', None)
        release = Release.objects.create(parent_id=parent, **validated_data)
        SourceLink.objects.bulk_create([SourceLink(release=release, source_id=item['source'], relation=item['relation']) for item in sources])
        return release

    def update(self, instance, validated_data):
        sources = validated_data.pop('sources', None)
        if 'parent' in validated_data:
            instance.parent_id = validated_data.pop('parent')
        for key, value in validated_data.items():
            setattr(instance, key, value)
        instance.save()
        if sources is not None:
            instance.sources.all().delete()
            SourceLink.objects.bulk_create([SourceLink(release=instance, source_id=item['source'], relation=item['relation']) for item in sources])
        return instance


class UploadReservationSerializer(StrictSerializer):
    path = serializers.CharField(max_length=512)
    size = serializers.IntegerField(min_value=1)
    sha256 = serializers.RegexField(r'^[a-fA-F0-9]{64}$', required=False, allow_blank=True)
