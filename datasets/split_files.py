"""Resolve split references inside a release and inspect bounded column headers."""
import csv
import json
import uuid

from django.core.exceptions import ImproperlyConfigured
from rest_framework.exceptions import APIException, ValidationError

from artifacts.storage import storage
from artifacts.validation import extension

TABULAR = {'.csv', '.tsv', '.json', '.jsonl', '.parquet'}


def column_names(item):
    """Inspect schema, not all records; do not load datasets into application RAM."""
    try:
        with storage().open(item.storage_key, 'rb') as stream:
            ext = extension(item.path)
            if ext in {'.csv', '.tsv'}:
                def header_lines():
                    remaining = 2 * 1024 * 1024
                    while remaining:
                        line = stream.readline(remaining + 1)
                        if not line:
                            return
                        remaining -= len(line)
                        if remaining < 0:
                            raise ValueError('The CSV header exceeds 2 MiB.')
                        yield line.decode('utf-8-sig')
                    raise ValueError('The CSV header exceeds 2 MiB.')
                reader = csv.reader(header_lines(), delimiter='\t' if ext == '.tsv' else ',', strict=True)
                return next((row for row in reader if row), [])
            if ext == '.jsonl':
                remaining = 2 * 1024 * 1024
                while remaining > 0:
                    line = stream.readline(remaining + 1)
                    remaining -= len(line)
                    if remaining < 0:
                        raise ValueError('The first JSONL record exceeds 2 MiB.')
                    if not line:
                        break
                    if line.strip():
                        record = json.loads(line.decode('utf-8-sig'))
                        return list(record) if isinstance(record, dict) else []
                return []
            if ext == '.json':
                content = stream.read(10 * 1024 * 1024 + 1)
                if len(content) > 10 * 1024 * 1024:
                    raise ValueError('JSON inspection is limited to 10 MiB; use JSONL for larger datasets.')
                records = json.loads(content.decode('utf-8-sig'))
                record = records[0] if isinstance(records, list) and records else records
                return list(record) if isinstance(record, dict) else []
            if ext == '.parquet':
                # Bound untrusted footer allocation before invoking Arrow's parser.
                stream.seek(-8, 2)
                footer = stream.read(8)
                if footer[4:] != b'PAR1' or int.from_bytes(footer[:4], 'little') > 16 * 1024 * 1024:
                    raise ValueError('Invalid or oversized Parquet footer.')
                stream.seek(0)
                import pyarrow.parquet as pq
                with pq.ParquetFile(stream, pre_buffer=False, arrow_extensions_enabled=False, thrift_string_size_limit=16 * 1024 * 1024, thrift_container_size_limit=100000, schema_depth_limit=64) as parquet:
                    return parquet.schema_arrow.names
            raise ValueError('Column splits require CSV, TSV, JSON records, JSONL, or Parquet. Upload archive contents as individual files.')
    except (OSError, ImproperlyConfigured) as error:
        exception = APIException('Dataset file storage is unavailable. Retry after the storage service is restored.')
        exception.status_code = 503
        raise exception from error
    except (ValueError, UnicodeError, csv.Error) as error:
        raise ValidationError({'splits': {'column': str(error)}}) from error


def validate_split_files(metadata, release):
    config = metadata.get('splits', {})
    if not isinstance(config, dict) or 'method' not in config:
        return metadata  # Keep old counts and empty declarations unchanged.
    files = list(release.files.exclude(status='cancelled'))
    by_id = {str(item.pk): item for item in files}
    by_path = {item.path: item for item in files}

    def resolve(reference):
        try:
            identifier = str(uuid.UUID(reference))
        except ValueError:
            identifier = reference
        item = by_id.get(identifier) or by_path.get(reference)
        if item is None:
            raise ValidationError({'splits': 'File references must identify files attached to this exact release. Upload files first, then use their artifact IDs or exact relative paths.'})
        if item.status in {'rejected', 'cancelled'}:
            raise ValidationError({'splits': f'{item.path} has not passed upload validation.'})
        return item

    config = dict(config)
    if config['method'] == 'separate_files':
        resolved = {partition: str(resolve(reference).pk) for partition, reference in config['files'].items()}
        if len(set(resolved.values())) != len(resolved):
            raise ValidationError({'splits': 'Separate partitions must reference distinct uploaded files.'})
        config['files'] = resolved
    elif config['method'] == 'column':
        if config.get('file'):
            item = resolve(config['file'])
        else:
            candidates = [item for item in files if extension(item.path) in TABULAR and item.path.rsplit('/', 1)[-1].lower() not in {'schema.json', 'dataset_schema.json', 'dataset_schema_example.json'}]
            if len(candidates) != 1:
                raise ValidationError({'splits': {'file': 'Set file to one attached dataset artifact ID, or upload exactly one supported data file.'}})
            item = candidates[0]
        if item.status != 'ready':
            raise ValidationError({'splits': 'Wait for the selected dataset file to finish validation before saving a column split.'})
        names = column_names(item)
        if names.count(config['column']) != 1:
            raise ValidationError({'splits': {'column': f'Column {config["column"]!r} must occur exactly once in the uploaded dataset header/schema.'}})
        config['file'] = str(item.pk)
    elif config.get('file'):
        config['file'] = str(resolve(config['file']).pk)
    return {**metadata, 'splits': config}
