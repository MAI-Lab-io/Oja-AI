"""Conditional split configuration and backward-compatible example counts."""
from decimal import Decimal
import math

from rest_framework import serializers
from artifacts.validation import safe_path
from repositories.metadata import StrictSerializer

PARTITIONS = {'train', 'validation', 'test'}
CONFIG_KEYS = {'status', 'method', 'files', 'file', 'column', 'values', 'ratios'}


class FileReferenceField(serializers.CharField):
    def __init__(self, **kwargs):
        super().__init__(max_length=512, **kwargs)

    def to_internal_value(self, data):
        value = super().to_internal_value(data)
        try:
            return safe_path(value)
        except ValueError as error:
            raise serializers.ValidationError(str(error))


class SplitConfigurationSerializer(StrictSerializer):
    status = serializers.ChoiceField(choices=['predefined', 'not_provided'])
    method = serializers.ChoiceField(choices=['separate_files', 'column', 'user_defined'])
    files = serializers.DictField(child=FileReferenceField(), required=False, allow_null=True)
    file = FileReferenceField(required=False, allow_null=True)
    column = serializers.CharField(max_length=150, trim_whitespace=False, required=False, allow_null=True)
    values = serializers.DictField(child=serializers.CharField(max_length=100, trim_whitespace=False), required=False, allow_null=True)
    ratios = serializers.JSONField(required=False, allow_null=True)

    def validate(self, attrs):
        method = attrs['method']
        expected = 'not_provided' if method == 'user_defined' else 'predefined'
        if attrs['status'] != expected:
            raise serializers.ValidationError({'status': f'{method} requires status={expected}.'})
        used = {'separate_files': {'files'}, 'column': {'file', 'column', 'values'}, 'user_defined': {'file', 'ratios'}}[method]
        for name in {'files', 'file', 'column', 'values', 'ratios'} - used:
            if attrs.get(name) is not None:
                raise serializers.ValidationError({name: f'This field must be omitted or null for {method}.'})
        if method in {'separate_files', 'column'}:
            name = 'files' if method == 'separate_files' else 'values'
            mapping = attrs.get(name)
            if not mapping or set(mapping) - PARTITIONS:
                raise serializers.ValidationError({name: 'Provide a nonempty mapping using train, validation, and/or test.'})
            if len(set(mapping.values())) != len(mapping):
                raise serializers.ValidationError({name: 'Each partition must have a distinct file or value.'})
        if method == 'column' and not (attrs.get('column') or '').strip():
            raise serializers.ValidationError({'column': 'A split column is required.'})
        if method == 'column' and any(not value.strip() for value in attrs['values'].values()):
            raise serializers.ValidationError({'values': 'Split values must be nonblank strings.'})
        ratios = attrs.get('ratios')
        if method == 'user_defined' and ratios is not None:
            if not isinstance(ratios, dict) or set(ratios) - PARTITIONS or not {'train', 'test'} <= set(ratios):
                raise serializers.ValidationError({'ratios': 'Provide train and test percentages; validation is optional.'})
            if any(type(value) not in (int, float) or not 0 < value <= 100 or not math.isfinite(value) for value in ratios.values()):
                raise serializers.ValidationError({'ratios': 'Percentages must be finite, positive JSON numbers no greater than 100.'})
            if sum(Decimal(str(value)) for value in ratios.values()) != Decimal('100'):
                raise serializers.ValidationError({'ratios': 'Percentages must sum to 100.'})
        attrs.setdefault('ratios', None)
        return attrs


class SplitsField(serializers.Field):
    def to_internal_value(self, value):
        if not isinstance(value, dict):
            raise serializers.ValidationError('Splits must be a JSON object.')
        if set(value) & CONFIG_KEYS:
            serializer = SplitConfigurationSerializer(data=value)
            serializer.is_valid(raise_exception=True)
            return serializer.validated_data
        # Old dictionaries represent declared example COUNTS, never percentages.
        if len(value) > 30 or any(not name or len(name) > 100 for name in value):
            raise serializers.ValidationError('At most 30 named splits are supported, with names up to 100 characters.')
        return serializers.DictField(child=serializers.IntegerField(min_value=0)).run_validation(value)

    def to_representation(self, value):
        return value
