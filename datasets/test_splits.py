import json
from pathlib import Path

from django.conf import settings
from django.test import SimpleTestCase

from .metadata import DatasetMetadataSerializer
from .splits import SplitsField


class SplitConfigurationTests(SimpleTestCase):
    def validate(self, value):
        return SplitsField().run_validation(value)

    def test_three_methods_and_optional_validation_partition(self):
        configurations = [
            {'status': 'predefined', 'method': 'separate_files', 'files': {'train': 'train.csv', 'test': 'test.csv'}, 'ratios': None},
            {'status': 'predefined', 'method': 'column', 'column': 'split', 'values': {'train': 'Train', 'validation': 'Valid', 'test': 'Test'}, 'ratios': None},
            {'status': 'not_provided', 'method': 'user_defined', 'column': None, 'values': None, 'ratios': None},
        ]
        for value in configurations:
            with self.subTest(value=value):
                self.assertEqual(self.validate(value), value)
        for ratios in [{'train': 70, 'validation': 15, 'test': 15}, {'train': 80, 'test': 20}, {'train': 33.3, 'validation': 33.3, 'test': 33.4}]:
            self.assertEqual(self.validate({'status': 'not_provided', 'method': 'user_defined', 'ratios': ratios})['ratios'], ratios)

    def test_invalid_ratios_methods_and_cross_method_fields_are_rejected(self):
        from rest_framework.exceptions import ValidationError
        invalid_ratios = [[], {}, {'train': 70, 'test': 20}, {'train': 100, 'test': 0}, {'train': -10, 'test': 110}, {'train': '80', 'test': 20}, {'train': True, 'test': 99}, {'train': float('nan'), 'test': 20}, {'train': float('inf'), 'test': 20}, {'train': 10 ** 500, 'test': 20}, {'train': 70, 'dev': 10, 'test': 20}]
        for ratios in invalid_ratios:
            with self.subTest(ratios=ratios), self.assertRaises(ValidationError):
                self.validate({'status': 'not_provided', 'method': 'user_defined', 'ratios': ratios})
        invalid = [
            {'status': 'predefined', 'method': 'random'},
            {'status': 'predefined', 'method': 'user_defined'},
            {'status': 'not_provided', 'method': 'user_defined', 'column': 'split'},
            {'status': 'predefined', 'method': 'separate_files', 'files': {}, 'ratios': None},
            {'status': 'predefined', 'method': 'separate_files', 'files': {'train': '../secret.csv'}},
            {'status': 'predefined', 'method': 'column', 'column': None, 'values': {'train': 'Train'}},
            {'status': 'predefined', 'method': 'column', 'column': 'split', 'values': {'dev': 'Valid'}},
            {'status': 'predefined', 'method': 'column', 'column': 'split', 'values': {'train': 'same', 'test': 'same'}},
            {'status': 'predefined', 'method': 'column', 'column': 'split', 'values': {'train': 'Train'}, 'ratios': {'train': 80, 'test': 20}},
        ]
        for value in invalid:
            with self.subTest(value=value), self.assertRaises(ValidationError):
                self.validate(value)

    def test_legacy_counts_and_empty_schema_remain_supported(self):
        for value in [{}, {'train': 70, 'validation': 15, 'test': 15}, {'evaluation': 1200}]:
            self.assertEqual(self.validate(value), value)

    def test_dataset_example_and_existing_feature_structure_are_valid(self):
        examples = sorted((Path(settings.BASE_DIR) / 'schema').glob('dataset*example.json'))
        self.assertEqual(len(examples), 4)
        for path in examples:
            example = json.loads(path.read_text(encoding='utf-8'))
            data = {'license': 'CC-BY-4.0', 'task': 'classification', 'intended_use': 'Research', 'limitations': 'Synthetic', 'modality': 'tabular', 'collection_method': 'Generated', 'contains_personal_data': 'no', **example}
            serializer = DatasetMetadataSerializer(data=data)
            self.assertTrue(serializer.is_valid(), (path.name, serializer.errors))
            self.assertEqual(serializer.validated_data['features'], example['features'])
        serializer = DatasetMetadataSerializer(data={**data, 'features': [{'name': 'age'}]})
        self.assertFalse(serializer.is_valid())
        self.assertIn('features', serializer.errors)
