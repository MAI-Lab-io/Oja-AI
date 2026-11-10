from rest_framework import serializers
from repositories.metadata import MetadataSerializer


class ModelMetadataSerializer(MetadataSerializer):
    framework = serializers.ChoiceField(choices=['pytorch', 'tensorflow', 'onnx', 'jax', 'other'])
    architecture = serializers.CharField(max_length=1000)
    training_description = serializers.CharField(max_length=10000)
    parameter_count = serializers.IntegerField(min_value=0, required=False)
