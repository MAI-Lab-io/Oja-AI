from datetime import timedelta
import hashlib
import json
import uuid

from django.conf import settings
from django.core.exceptions import ImproperlyConfigured
from django.core.cache import cache
from django.db import IntegrityError, transaction
from django.db.models.deletion import ProtectedError
from django.db.models import Count, Exists, F, OuterRef, Prefetch, Q, Subquery, Sum
from django.db.models.functions import Lower
from django.http import FileResponse, StreamingHttpResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.utils.http import content_disposition_header
from rest_framework import status, viewsets
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.exceptions import APIException, PermissionDenied, ValidationError
from rest_framework.permissions import AllowAny, BasePermission, SAFE_METHODS
from rest_framework.response import Response
from rest_framework.throttling import UserRateThrottle

from accounts.models import User
from accounts.permissions import IsVerifiedContributor
from artifacts.models import Artifact, ArtifactDeletion
from artifacts.storage import storage
from artifacts.streams import BoundedRequestFile
from artifacts.validation import check_extension, extension, EXTENSIONS
from releases.models import Release, ReleaseEvent, SourceLink
from .models import Repository
from .metadata import LICENSES
from .pagination import CatalogPagination
from .serializers import RepositorySerializer, ReleaseSerializer, ArtifactSerializer, UploadReservationSerializer, validate_metadata
from datasets.split_files import validate_split_files
from artifacts.downloads import CompletedDownload, release_archive


class Conflict(APIException):
    status_code = 409
    default_detail = 'This operation conflicts with the current state.'


class StorageUnavailable(APIException):
    status_code = 503
    default_detail = 'File storage is unavailable. Check the storage directory and service permissions, then retry.'


class UploadThrottle(UserRateThrottle):
    rate = '600/min'


class CatalogPermission(BasePermission):
    def has_permission(self, request, view):
        return request.method in SAFE_METHODS or IsVerifiedContributor().has_permission(request, view)


def require_owner(request, repository):
    if repository.owner_id != request.user.pk:
        raise PermissionDenied('Only the repository owner can make changes.')


def require_draft(release):
    if release.status != 'draft':
        raise Conflict('Published releases are immutable. Create a new version.')


def validate_public_access(repository, metadata, sources):
    if repository.kind == 'dataset' and metadata.get('contains_personal_data') != 'no':
        raise ValidationError('Public datasets must be declared free of personal data in this milestone.')
    if any(link.source.repository_id != repository.pk and link.source.repository.visibility != 'public' for link in sources):
        raise ValidationError('A public release cannot reference a private source. Make its upstream repository public first.')


def visible_releases(user):
    query = Release.objects.select_related('repository__owner', 'created_by').prefetch_related('sources', 'files')
    public = Q(status='published', repository__visibility='public')
    return query.filter(public | Q(repository__owner=user)) if user.is_authenticated else query.filter(public)


class RepositoryViewSet(viewsets.ModelViewSet):
    pagination_class = CatalogPagination
    serializer_class = RepositorySerializer
    permission_classes = [CatalogPermission]
    throttle_classes = [UploadThrottle]
    http_method_names = ['get', 'post', 'patch', 'delete', 'head', 'options']

    def get_queryset(self):
        published = Release.objects.filter(repository_id=OuterRef('pk'), status='published')
        summaries = Release.objects.filter(status='published').annotate(
            summary_file_count=Count('files', filter=Q(files__status='ready')),
            summary_total_size=Sum('files__size', filter=Q(files__status='ready')),
        ).order_by('-published_at', '-created_at')[:1]
        query = Repository.objects.select_related('owner').annotate(has_published=Exists(published)).prefetch_related(
            Prefetch('releases', queryset=summaries, to_attr='published_summary')
        )
        public = Q(visibility='public', has_published=True)
        query = query.filter(public | Q(owner=self.request.user)) if self.request.user.is_authenticated else query.filter(public)
        if self.request.query_params.get('scope') == 'mine':
            query = query.filter(owner=self.request.user) if self.request.user.is_authenticated else query.none()
        elif self.request.query_params.get('scope') == 'public':
            query = query.filter(public)
        if self.request.query_params.get('kind') in {'model', 'dataset'}:
            query = query.filter(kind=self.request.query_params['kind'])
        if 'owner' in self.request.query_params:
            query = query.filter(owner__username=self.request.query_params['owner'])
        if 'slug' in self.request.query_params:
            query = query.filter(slug__iexact=self.request.query_params['slug'])
        search = self.request.query_params.get('search', '').strip()[:150]
        if search:
            query = query.filter(Q(name__icontains=search) | Q(slug__icontains=search) | Q(description__icontains=search) | Q(owner__username__icontains=search))
        ordering = self.request.query_params.get('ordering')
        if ordering == 'name':
            return query.order_by(Lower('name'), 'id')
        if ordering in {'newest', 'downloads'}:
            query = query.annotate(latest_published_at=Subquery(published.order_by('-published_at', '-created_at').values('published_at')[:1]))
            fields = [F('latest_published_at').desc(nulls_last=True), Lower('name'), 'id']
            return query.order_by(*(['-download_count'] if ordering == 'downloads' else []), *fields)
        return query.order_by('-created_at', '-id')

    def perform_create(self, serializer):
        try:
            with transaction.atomic():
                User.objects.select_for_update().get(pk=self.request.user.pk)
                serializer.save(owner=self.request.user)
        except IntegrityError:
            raise Conflict('A repository with this slug already exists.')

    def perform_update(self, serializer):
        require_owner(self.request, serializer.instance)
        with transaction.atomic():
            # Serialize access changes with publication so a private-only version
            # cannot be published concurrently with making the repository public.
            repository = Repository.objects.select_for_update().get(pk=serializer.instance.pk)
            previous = repository.visibility
            visibility = serializer.validated_data.get('visibility', previous)
            if visibility == 'public' and previous != visibility:
                published = repository.releases.filter(status='published').prefetch_related('sources__source__repository', 'files')
                for release in published.iterator(chunk_size=200):
                    metadata = validate_metadata(repository.kind, release.metadata)
                    validate_public_access(repository, metadata, release.sources.all())
                    files = [item for item in release.files.all() if item.status != 'cancelled']
                    if not files or any(item.status != 'ready' for item in files):
                        raise Conflict(f'Version {release.version} must have validated files before it can be public.')
                    if not (settings.DEBUG and settings.UPLOAD_SCAN_MODE == 'development') and any(item.scan_status != 'clean' for item in files):
                        raise Conflict(f'Version {release.version} must pass malware scanning before it can be public.')
            repository.published_summary = getattr(serializer.instance, 'published_summary', [])
            serializer.instance = repository
            serializer.save()
            if previous != visibility:
                ReleaseEvent.objects.bulk_create([
                    ReleaseEvent(release_id=release_id, actor=self.request.user, action=f'visibility_{visibility}')
                    for release_id in repository.releases.values_list('pk', flat=True)
                ])
                transaction.on_commit(lambda: cache.delete('public-platform-statistics-v1'))

    def destroy(self, request, pk=None):
        repository = self.get_object()
        require_owner(request, repository)
        confirmation = request.data.get('confirmation') if isinstance(request.data, dict) else None
        if confirmation != f'{repository.owner.username}/{repository.slug}':
            raise ValidationError('Type the full owner/repository identifier to confirm deletion.')
        try:
            with transaction.atomic():
                # Match quota reservation ordering; no_key permits ordinary FK inserts.
                User.objects.select_for_update(no_key=True).get(pk=request.user.pk)
                repository = get_object_or_404(Repository.objects.select_for_update(), pk=repository.pk)
                releases = list(Release.objects.select_for_update().filter(repository=repository).order_by('pk'))
                if SourceLink.objects.filter(source__repository=repository).exclude(release__repository=repository).exists():
                    raise Conflict('Another repository references a release in this repository. Remove draft references first, or make this repository private instead.')
                files = list(Artifact.objects.select_for_update().filter(release__repository=repository).order_by('pk'))
                if any(item.status in {'receiving', 'validating'} for item in files):
                    raise Conflict('Wait for active uploads and validation to finish before deleting this repository.')
                ArtifactDeletion.objects.bulk_create([
                    ArtifactDeletion(owner=request.user, storage_key=item.storage_key, declared_size=item.declared_size)
                    for item in files if item.storage_key
                ])
                Artifact.objects.filter(release__repository=repository).delete()
                ReleaseEvent.objects.filter(release__repository=repository).delete()
                SourceLink.objects.filter(release__repository=repository).delete()
                Release.objects.filter(repository=repository).update(parent=None)
                Release.objects.filter(pk__in=[item.pk for item in releases]).delete()
                repository.delete()
                transaction.on_commit(lambda: cache.delete('public-platform-statistics-v1'))
        except (ProtectedError, IntegrityError):
            raise Conflict('This repository is still referenced and cannot be deleted. Remove draft references first, or make it private instead.')
        return Response(status=204)

    @action(detail=True, methods=['get', 'post'])
    def releases(self, request, pk=None):
        repository = self.get_object()
        context = {'request': request, 'repository': repository}
        if request.method == 'GET':
            items = visible_releases(request.user).filter(repository=repository)
            if 'version' in request.query_params:
                items = items.filter(version__iexact=request.query_params['version'])
            items = items.order_by('-created_at')[:100]
            return Response(ReleaseSerializer(items, many=True, context=context).data)
        require_owner(request, repository)
        serializer = ReleaseSerializer(data=request.data, context=context)
        serializer.is_valid(raise_exception=True)
        try:
            with transaction.atomic():
                Repository.objects.select_for_update().get(pk=repository.pk)
                release = serializer.save(repository=repository, created_by=request.user)
                ReleaseEvent.objects.create(release=release, actor=request.user, action='draft_created')
        except IntegrityError:
            raise Conflict('This version already exists.')
        return Response(ReleaseSerializer(release, context=context).data, status=201)


class ReleaseViewSet(viewsets.GenericViewSet):
    permission_classes = [CatalogPermission]
    throttle_classes = [UploadThrottle]

    def get_queryset(self):
        return visible_releases(self.request.user)

    def retrieve(self, request, pk=None):
        release = self.get_object()
        return Response(ReleaseSerializer(release, context={'request': request, 'repository': release.repository}).data)

    def partial_update(self, request, pk=None):
        release = self.get_object()
        require_owner(request, release.repository)
        with transaction.atomic():
            release = Release.objects.select_for_update().get(pk=release.pk)
            require_draft(release)
            serializer = ReleaseSerializer(release, data=request.data, partial=True, context={'request': request, 'repository': release.repository})
            serializer.is_valid(raise_exception=True)
            try:
                with transaction.atomic():
                    serializer.save()
            except IntegrityError:
                raise Conflict('This version already exists.')
            ReleaseEvent.objects.create(release=release, actor=request.user, action='draft_updated')
        return Response(serializer.data)

    @action(detail=True, methods=['post'])
    def files(self, request, pk=None):
        release = self.get_object()
        require_owner(request, release.repository)
        serializer = UploadReservationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        values = serializer.validated_data
        try:
            check_extension(values['path'], release.repository.kind)
        except ValueError as error:
            raise ValidationError({'path': str(error)})
        if values['size'] > settings.UPLOAD_MAX_FILE_BYTES:
            raise ValidationError({'size': f'File exceeds the {settings.UPLOAD_MAX_FILE_BYTES} byte limit.'})
        try:
            storage().ensure_available()
        except (OSError, ImproperlyConfigured):
            raise StorageUnavailable()
        try:
            with transaction.atomic():
                # Serialize quota reservations across all this owner's repositories.
                User.objects.select_for_update().get(pk=request.user.pk)
                release = Release.objects.select_for_update().get(pk=release.pk)
                require_draft(release)
                charged = Artifact.objects.filter(release__repository__owner=request.user).exclude(status='cancelled', storage_key='').aggregate(total=Sum('declared_size'))['total'] or 0
                charged += ArtifactDeletion.objects.filter(owner=request.user).aggregate(total=Sum('declared_size'))['total'] or 0
                if charged + values['size'] > settings.UPLOAD_USER_QUOTA_BYTES:
                    raise ValidationError('Your storage quota would be exceeded. Remove unused draft uploads first.')
                if release.files.exclude(status='cancelled').count() >= settings.UPLOAD_MAX_FILES:
                    raise ValidationError('This release has reached its file limit.')
                item = Artifact.objects.create(release=release, path=values['path'], declared_size=values['size'], expected_sha256=values.get('sha256', '').lower(), expires_at=timezone.now() + timedelta(hours=24))
                ReleaseEvent.objects.create(release=release, actor=request.user, action='upload_reserved')
        except IntegrityError:
            raise Conflict('A file with this path already exists in this release.')
        return Response({'file': ArtifactSerializer(item).data, 'upload_url': f'/api/v1/artifacts/{item.pk}/content/', 'method': 'PUT'}, status=201)

    @action(detail=True, methods=['post'])
    def publish(self, request, pk=None):
        release = self.get_object()
        require_owner(request, release.repository)
        with transaction.atomic():
            Repository.objects.select_for_update().get(pk=release.repository_id)
            release = Release.objects.select_for_update(of=('self',)).select_related('repository__owner').get(pk=release.pk)
            if release.status == 'published':
                return Response({'id': str(release.pk), 'manifest_sha256': release.manifest_sha256, 'status': 'published'})
            metadata = validate_metadata(release.repository.kind, release.metadata, require_schema=True)
            if release.repository.kind == 'dataset':
                metadata = validate_split_files(metadata, release)
            if not release.rights_confirmed or not release.card.strip() or not release.changelog.strip():
                raise ValidationError('A card, changelog, and upload-rights confirmation are required to publish.')
            files = list(release.files.exclude(status='cancelled').order_by('path'))
            if not files or any(item.status != 'ready' for item in files):
                raise Conflict('All files must finish validation before publishing. Remove rejected files first.')
            if release.repository.kind == 'model' and not any(extension(item.path) in {'.safetensors', '.onnx', '.pt', '.pth', '.h5', '.keras', '.zip'} for item in files):
                raise ValidationError('A model release requires at least one model weight or model archive file.')
            if any(item.scan_status != 'clean' for item in files) and not (settings.DEBUG and settings.UPLOAD_SCAN_MODE == 'development'):
                raise Conflict('All files must pass malware scanning before publication.')
            sources = list(release.sources.select_related('source__repository').order_by('source_id', 'relation'))
            if release.repository.visibility == 'public':
                validate_public_access(release.repository, metadata, sources)
            published_at = timezone.now()
            release.manifest = {
                'schema': release.metadata_schema, 'release_id': str(release.pk), 'version': release.version,
                'repository': f'{release.repository.owner.username}/{release.repository.slug}', 'kind': release.repository.kind,
                'parent': str(release.parent_id) if release.parent_id else None,
                'metadata': metadata, 'card': release.card, 'changelog': release.changelog,
                'created_by': str(release.created_by_id), 'rights_confirmed': release.rights_confirmed,
                'published_at': published_at.isoformat(),
                'sources': [{'release_id': str(link.source_id), 'relation': link.relation, 'manifest_sha256': link.source.manifest_sha256} for link in sources],
                'files': [{'id': str(item.pk), 'path': item.path, 'size': item.size, 'sha256': item.sha256, 'scan_status': item.scan_status, 'validation_profile': item.validation_profile, 'validated_at': item.validated_at.isoformat() if item.validated_at else None} for item in files],
            }
            release.manifest_sha256 = hashlib.sha256(json.dumps(release.manifest, sort_keys=True, separators=(',', ':'), ensure_ascii=False).encode()).hexdigest()
            release.status, release.published_at = 'published', published_at
            release.metadata = metadata
            release.save(update_fields=['status', 'published_at', 'manifest', 'manifest_sha256', 'metadata'])
            ReleaseEvent.objects.create(release=release, actor=request.user, action='published')
        return Response({'id': str(release.pk), 'manifest_sha256': release.manifest_sha256, 'status': 'published'})

    @action(detail=True, methods=['get'])
    def download(self, request, pk=None):
        release = self.get_object()
        if release.status != 'published':
            raise Conflict('Publish this version before downloading it as an archive.')
        files = [item for item in release.files.all() if item.status != 'cancelled']
        if not files or any(item.status != 'ready' for item in files):
            raise Conflict('All version files must be ready before download.')
        files.sort(key=lambda item: item.path)
        try:
            # Fail before sending a success response if storage is unavailable.
            with storage().open(files[0].storage_key, 'rb'):
                pass
        except (OSError, ImproperlyConfigured):
            raise StorageUnavailable()
        content = release_archive(files, release.manifest)
        if request.method == 'GET':
            content = CompletedDownload(content, release.repository_id)
        response = StreamingHttpResponse(content, content_type='application/zip')
        response['Content-Disposition'] = content_disposition_header(True, f'{release.repository.slug}-{release.version}.zip')
        response['Cache-Control'] = 'private, no-store'
        response['X-Content-Type-Options'] = 'nosniff'
        response['X-Manifest-SHA256'] = release.manifest_sha256
        if request.method == 'GET':
            Repository.objects.filter(pk=release.repository_id).update(download_request_count=F('download_request_count') + 1)
        return response

    @action(detail=True, methods=['get'])
    def manifest(self, request, pk=None):
        release = self.get_object()
        if release.status != 'published':
            raise Conflict('A manifest is created when a release is published.')
        return Response({'sha256': release.manifest_sha256, 'manifest': release.manifest})

    @action(detail=True, methods=['get'])
    def events(self, request, pk=None):
        release = self.get_object()
        return Response(list(release.events.order_by('created_at', 'id').values('action', 'actor_id', 'created_at')[:1000]))


class ArtifactViewSet(viewsets.GenericViewSet):
    permission_classes = [CatalogPermission]
    throttle_classes = [UploadThrottle]

    def get_queryset(self):
        return Artifact.objects.select_related('release__repository__owner').filter(release__in=visible_releases(self.request.user)).exclude(status='cancelled')

    @action(detail=True, methods=['put'])
    def content(self, request, pk=None):
        item = self.get_object()
        require_owner(request, item.release.repository)
        if request.content_type != 'application/octet-stream':
            raise ValidationError('Upload raw bytes with Content-Type: application/octet-stream.')
        try:
            length = int(request.META.get('CONTENT_LENGTH', ''))
        except ValueError:
            raise ValidationError('A Content-Length header is required.')
        if length != item.declared_size:
            raise ValidationError('Content-Length does not match the declared file size.')
        with transaction.atomic():
            release = Release.objects.select_for_update().get(pk=item.release_id)
            require_draft(release)
            item = Artifact.objects.select_for_update().get(pk=item.pk)
            if item.status != 'pending' or item.expires_at <= timezone.now():
                raise Conflict('This upload is already used, cancelled, or expired. Reserve another upload.')
            item.status, item.lease = 'receiving', uuid.uuid4()
            item.storage_key = f'blobs/{item.pk}/{item.lease}'
            item.expires_at = timezone.now() + timedelta(hours=2)
            item.save(update_fields=['status', 'lease', 'storage_key', 'expires_at'])
        key = item.storage_key
        try:
            key = storage().save(key, BoundedRequestFile(request, item.declared_size))
            with transaction.atomic():
                updated = Artifact.objects.filter(pk=item.pk, lease=item.lease, status='receiving').update(status='uploaded', storage_key=key)
                if not updated:
                    raise Conflict('The upload session was cancelled while receiving data.')
                ReleaseEvent.objects.create(release_id=item.release_id, actor=request.user, action='file_uploaded')
        except Exception as error:
            if key:
                try:
                    storage().delete(key)
                    Artifact.objects.filter(pk=item.pk).update(storage_key='')
                except Exception:
                    Artifact.objects.filter(pk=item.pk).update(storage_key=key)
            Artifact.objects.filter(pk=item.pk, lease=item.lease, status='receiving').update(status='rejected', error='Upload interrupted. Cancel this file and retry.')
            if isinstance(error, APIException):
                raise
            raise StorageUnavailable() from error
        return Response({'id': str(item.pk), 'status': 'uploaded'}, status=202)

    def destroy(self, request, pk=None):
        item = self.get_object()
        require_owner(request, item.release.repository)
        with transaction.atomic():
            release = Release.objects.select_for_update().get(pk=item.release_id)
            require_draft(release)
            item = Artifact.objects.select_for_update().get(pk=item.pk)
            if item.status in {'receiving', 'validating'}:
                raise Conflict('Wait for the current upload or validation to finish.')
            item.status = 'cancelled'
            item.save(update_fields=['status'])
            ReleaseEvent.objects.create(release=release, actor=request.user, action='file_removed')
        # Worker cleanup retries failed deletions; retained blobs remain charged to quota.
        from artifacts.processing import cleanup_expired
        cleanup_expired()
        return Response(status=204)

    @action(detail=True, methods=['get'])
    def download(self, request, pk=None):
        item = self.get_object()
        if item.status != 'ready':
            raise Conflict('This file has not passed validation.')
        try:
            stream = storage().open(item.storage_key, 'rb')
        except (OSError, ImproperlyConfigured):
            raise StorageUnavailable()
        response = FileResponse(stream, as_attachment=True, filename=item.path.rsplit('/', 1)[-1], content_type='application/octet-stream')
        response['X-Content-Type-Options'] = 'nosniff'
        response['Cache-Control'] = 'private, no-store'
        response['ETag'] = f'"{item.sha256}"'
        response['X-Checksum-SHA256'] = item.sha256
        if request.method == 'GET' and item.release.status == 'published':
            # Reassigning FileResponse.streaming_content disables the WSGI file
            # wrapper fast path, which would otherwise bypass our iterator.
            response.block_size = 64 * 1024
            response.streaming_content = CompletedDownload(response.streaming_content, item.release.repository_id)
            Repository.objects.filter(pk=item.release.repository_id).update(download_request_count=F('download_request_count') + 1)
        return response


@api_view(['GET'])
@permission_classes([AllowAny])
def upload_options(request):
    return Response({'max_file_bytes': settings.UPLOAD_MAX_FILE_BYTES, 'user_quota_bytes': settings.UPLOAD_USER_QUOTA_BYTES, 'max_files': settings.UPLOAD_MAX_FILES, 'extensions': {key: sorted(values) for key, values in EXTENSIONS.items()}, 'licenses': LICENSES, 'scan_mode': settings.UPLOAD_SCAN_MODE})
