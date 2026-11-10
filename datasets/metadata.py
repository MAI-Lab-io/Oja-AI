from rest_framework import serializers
from repositories.metadata import MetadataSerializer, StrictSerializer
from .splits import SplitsField


class FeatureSerializer(StrictSerializer):
    name = serializers.CharField(max_length=150)
    dtype = serializers.CharField(max_length=100)
    description = serializers.CharField(max_length=1000, required=False, allow_blank=True)


class DatasetMetadataSerializer(MetadataSerializer):
    modality = serializers.ChoiceField(choices=['tabular', 'text', 'image', 'medical', 'multimodal'])
    collection_method = serializers.CharField(max_length=10000)
    contains_personal_data = serializers.ChoiceField(choices=['no', 'yes', 'unknown'])
    splits = SplitsField(default=dict)
    features = FeatureSerializer(many=True, max_length=1000, required=False)

