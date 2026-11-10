import json
from pathlib import Path

from django.conf import settings
from django.test import SimpleTestCase

from .metadata import ModelMetadataSerializer


class ModelMetadataTests(SimpleTestCase):
    def test_example_is_valid_and_dataset_fields_are_rejected(self):
        metadata = json.loads((Path(settings.BASE_DIR) / 'schema' / 'model_schema_example.json').read_text(encoding='utf-8'))
        serializer = ModelMetadataSerializer(data=metadata)
        self.assertTrue(serializer.is_valid(), serializer.errors)
        serializer = ModelMetadataSerializer(data={**metadata, 'splits': {'train': 70}, 'features': []})
        self.assertFalse(serializer.is_valid())
        self.assertIn('splits', serializer.errors)
        self.assertIn('features', serializer.errors)
