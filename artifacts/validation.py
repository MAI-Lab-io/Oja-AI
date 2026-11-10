"""Bounded file inspection. Uploaded models are never imported or deserialized."""
import csv
import gzip
import hashlib
import json
from pathlib import PurePosixPath
import socket
import stat
import struct
import zipfile

from django.conf import settings

COMMON_EXTENSIONS = {'.json', '.txt', '.md', '.yaml', '.yml'}
csv.field_size_limit(2 * 1024 * 1024)
EXTENSIONS = {
    'model': COMMON_EXTENSIONS | {'.safetensors', '.onnx', '.pt', '.pth', '.h5', '.keras', '.zip'},
    'dataset': COMMON_EXTENSIONS | {'.csv', '.tsv', '.jsonl', '.parquet', '.png', '.jpg', '.jpeg', '.nii', '.nii.gz', '.dcm', '.zip'},
}


def safe_path(value):
    if not isinstance(value, str) or not value or len(value) > 512:
        raise ValueError('File paths must contain between 1 and 512 characters.')
    if '\\' in value or ':' in value or any(ord(c) < 32 or ord(c) == 127 for c in value):
        raise ValueError('Use a relative path with forward slashes and no control characters.')
    if value.startswith('/') or any(part in {'', '.', '..'} or part.endswith((' ', '.')) for part in value.split('/')):
        raise ValueError('Absolute paths, empty components and traversal are not allowed.')
    if any(len(part) > 200 for part in value.split('/')):
        raise ValueError('A path component is too long.')
    return value


def extension(path):
    return '.nii.gz' if path.lower().endswith('.nii.gz') else PurePosixPath(path).suffix.lower()


def check_extension(path, kind):
    safe_path(path)
    if extension(path) not in EXTENSIONS[kind] and PurePosixPath(path).name not in {'LICENSE', 'NOTICE'}:
        raise ValueError('Unsupported file extension for this repository type.')


def inspect_zip(stream, kind):
    # Bound central-directory parsing before constructing ZipFile (including ZIP64).
    stream.seek(0, 2)
    length = stream.tell()
    stream.seek(max(0, length - 65557))
    tail = stream.read(65557)
    marker = tail.rfind(b'PK\x05\x06')
    if marker < 0 or len(tail) - marker < 22:
        raise ValueError('Invalid ZIP archive.')
    count = struct.unpack_from('<H', tail, marker + 10)[0]
    directory_size = struct.unpack_from('<I', tail, marker + 12)[0]
    if count > 10000 or directory_size > 16 * 1024 * 1024 or b'PK\x06\x07' in tail:
        raise ValueError('Archive directory exceeds supported limits (ZIP64 is not supported).')
    stream.seek(0)
    total, paths = 0, set()
    with zipfile.ZipFile(stream) as archive:
        if len(archive.infolist()) != count or len(archive.infolist()) > 10000:
            raise ValueError('Archive entry count does not match its bounded directory.')
        for item in archive.infolist():
            path = item.filename.rstrip('/')
            safe_path(path)
            if path.casefold() in paths:
                raise ValueError('Archive contains duplicate paths.')
            paths.add(path.casefold())
            if item.flag_bits & 1 or stat.S_ISLNK(item.external_attr >> 16):
                raise ValueError('Encrypted files and symbolic links are not supported.')
            if item.is_dir():
                continue
            check_extension(path, kind)
            if extension(path) in {'.zip', '.keras'}:
                raise ValueError('Nested archives are not supported.')
            total += item.file_size
            if total > settings.UPLOAD_MAX_FILE_BYTES * 10 or item.file_size > max(item.compress_size, 1) * 200:
                raise ValueError('Archive expansion exceeds safety limits.')
        # Stream each member to validate CRCs, without extracting or executing it.
        for item in archive.infolist():
            if not item.is_dir():
                with archive.open(item) as member:
                    while member.read(64 * 1024):
                        pass


def inspect_format(stream, path, kind, size):
    stream.seek(0)
    header = stream.read(540)
    if header.startswith((b'MZ', b'\x7fELF', b'#!')):
        raise ValueError('Executable content is not allowed.')
    ext = extension(path)
    if ext in {'.zip', '.keras'}:
        inspect_zip(stream, kind)
    elif ext == '.png' and not header.startswith(b'\x89PNG\r\n\x1a\n'):
        raise ValueError('PNG signature does not match its extension.')
    elif ext in {'.jpg', '.jpeg'} and not header.startswith(b'\xff\xd8\xff'):
        raise ValueError('JPEG signature does not match its extension.')
    elif ext == '.h5' and not header.startswith(b'\x89HDF\r\n\x1a\n'):
        raise ValueError('HDF5 signature does not match its extension.')
    elif ext == '.parquet':
        stream.seek(-4, 2)
        if not header.startswith(b'PAR1') or stream.read(4) != b'PAR1':
            raise ValueError('Invalid Parquet signature.')
    elif ext == '.dcm' and header[128:132] != b'DICM':
        raise ValueError('DICOM uploads require the standard DICM preamble.')
    elif ext in {'.nii', '.nii.gz'}:
        if ext == '.nii.gz':
            stream.seek(0)
            with gzip.GzipFile(fileobj=stream) as compressed:
                header = compressed.read(540)
        if len(header) < 348 or not any(int.from_bytes(header[:4], byteorder) in {348, 540} for byteorder in ['little', 'big']):
            raise ValueError('Invalid NIfTI header.')
    elif ext == '.safetensors':
        if len(header) < 8:
            raise ValueError('Invalid safetensors header.')
        header_size = int.from_bytes(header[:8], 'little')
        if header_size < 2 or header_size > min(16 * 1024 * 1024, size - 8):
            raise ValueError('Invalid safetensors header size.')
        stream.seek(8)
        tensors = json.loads(stream.read(header_size))
        if not isinstance(tensors, dict):
            raise ValueError('Invalid safetensors tensor map.')
        for name, tensor in tensors.items():
            if name == '__metadata__':
                continue
            offsets = tensor.get('data_offsets') if isinstance(tensor, dict) else None
            if not isinstance(offsets, list) or len(offsets) != 2 or not all(type(x) is int for x in offsets) or not 0 <= offsets[0] <= offsets[1] <= size - 8 - header_size:
                raise ValueError('Invalid safetensors data offsets.')
    elif ext in {'.json', '.jsonl', '.csv', '.tsv', '.txt', '.md', '.yaml', '.yml'} or not ext:
        stream.seek(0)
        if ext in {'.json', '.yaml', '.yml'}:
            if size > 10 * 1024 * 1024:
                raise ValueError('JSON/YAML documents are limited to 10 MiB; use JSONL for large datasets.')
            content = stream.read().decode('utf-8-sig')
            if '\x00' in content:
                raise ValueError('Text files cannot contain NUL bytes.')
            if ext == '.json':
                json.loads(content)
            elif ext in {'.yaml', '.yml'}:
                import yaml
                yaml.safe_load(content)
        else:
            def lines():
                while True:
                    line = stream.readline(2 * 1024 * 1024 + 1)
                    if not line:
                        break
                    if len(line) > 2 * 1024 * 1024:
                        raise ValueError('Text records may not exceed 2 MiB.')
                    text = line.decode('utf-8-sig')
                    if '\x00' in text:
                        raise ValueError('Text files cannot contain NUL bytes.')
                    yield text
            if ext in {'.csv', '.tsv'}:
                width = None
                for row in csv.reader(lines(), delimiter='\t' if ext == '.tsv' else ',', strict=True):
                    if not row:
                        continue
                    if len(row) > 10000 or (width is not None and len(row) != width):
                        raise ValueError('Tabular rows must have consistent columns (at most 10,000).')
                    width = len(row)
                if width is None:
                    raise ValueError('The tabular file contains no rows.')
                return
            for text in lines():
                if ext == '.jsonl' and text.strip():
                    json.loads(text)
    # ONNX/PyTorch files remain opaque bytes: never pickle.load/torch.load/import.


def malware_scan(stream):
    if settings.UPLOAD_SCAN_MODE == 'development':
        if not settings.DEBUG:
            raise ValueError('Unscanned uploads cannot pass production validation.')
        return 'not_scanned'
    stream.seek(0)
    with socket.create_connection((settings.CLAMAV_HOST, settings.CLAMAV_PORT), timeout=30) as connection:
        connection.settimeout(120)
        connection.sendall(b'zINSTREAM\0')
        while chunk := stream.read(64 * 1024):
            connection.sendall(struct.pack('!I', len(chunk)) + chunk)
        connection.sendall(b'\0\0\0\0')
        response = bytearray()
        while len(response) < 4096:
            block = connection.recv(1024)
            if not block:
                break
            response.extend(block)
            if b'\0' in block:
                break
        if bytes(response).strip(b'\0\r\n') != b'stream: OK':
            raise ValueError('Malware scan failed or rejected this file.')
    return 'clean'


def validate_blob(artifact, stream):
    digest, size = hashlib.sha256(), 0
    while chunk := stream.read(1024 * 1024):
        size += len(chunk)
        if size > artifact.declared_size or size > settings.UPLOAD_MAX_FILE_BYTES:
            raise ValueError('File exceeds its declared size.')
        digest.update(chunk)
    checksum = digest.hexdigest()
    if size != artifact.declared_size:
        raise ValueError('Uploaded size does not match its declaration.')
    if artifact.expected_sha256 and checksum != artifact.expected_sha256:
        raise ValueError('SHA-256 checksum does not match.')
    inspect_format(stream, artifact.path, artifact.release.repository.kind, size)
    return size, checksum, malware_scan(stream)
