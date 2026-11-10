from rest_framework import serializers

LICENSES = ['MIT', 'Apache-2.0', 'BSD-3-Clause', 'GPL-3.0-only', 'CC0-1.0', 'CC-BY-4.0', 'CC-BY-SA-4.0', 'CDLA-Permissive-2.0', 'LicenseRef-Custom']


class StrictSerializer(serializers.Serializer):
    def to_internal_value(self, data):
        if not isinstance(data, dict):
            raise serializers.ValidationError('Expected an object.')
        unknown = set(data) - set(self.fields)
        if unknown:
            raise serializers.ValidationError({name: 'Unknown field.' for name in sorted(unknown)})
        return super().to_internal_value(data)


class MetadataSerializer(StrictSerializer):
    license = serializers.ChoiceField(choices=LICENSES)
    license_url = serializers.URLField(required=False, allow_blank=True, max_length=2000)
    task = serializers.CharField(max_length=100)
    languages = serializers.ListField(child=serializers.RegexField(r'^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$'), max_length=30, default=list)
    tags = serializers.ListField(child=serializers.CharField(max_length=50), max_length=30, default=list)
    intended_use = serializers.CharField(max_length=10000)
    limitations = serializers.CharField(max_length=10000)
    source_url = serializers.URLField(max_length=2000, required=False, allow_blank=True)
    code_url = serializers.URLField(max_length=2000, required=False, allow_blank=True)
    code_revision = serializers.CharField(max_length=200, required=False, allow_blank=True)
    methods = serializers.CharField(max_length=10000, required=False, allow_blank=True)
    citation = serializers.CharField(max_length=10000, required=False, allow_blank=True)

    def validate(self, attrs):
        if attrs.get('license') == 'LicenseRef-Custom' and not attrs.get('license_url'):
            raise serializers.ValidationError({'license_url': 'A custom license requires a license URL.'})
        return attrs
