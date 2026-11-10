"""Stream a version ZIP without loading files or creating a full staging copy."""
from collections import deque
import json
import logging
import zipfile

from django.db import DatabaseError
from django.db.models import F
from repositories.models import Repository

from .storage import storage
from .validation import safe_path

logger = logging.getLogger(__name__)


class CompletedDownload:
    """Count only normal iterator exhaustion, never response creation or close.

    The WSGI server resumes iteration after writing each chunk. A disconnect,
    generator close, or storage exception must not be mistaken for exhaustion.
    This is a server-stream metric; it cannot attest to a browser's disk save.
    """
    def __init__(self, content, repository_id):
        self.content = iter(content)
        self.repository_id = repository_id
        self.completed = False
        self.closed = False

    def __iter__(self):
        return self

    def __next__(self):
        if self.closed or self.completed:
            raise StopIteration
        try:
            return next(self.content)
        except StopIteration:
            self.completed = True
            try:
                Repository.objects.filter(pk=self.repository_id).update(download_count=F('download_count') + 1)
            except DatabaseError:
                # Download bytes have already been sent. A metrics failure must
                # not turn a successfully streamed file into an error response.
                logger.warning('Completed download count could not be recorded for repository %s.', self.repository_id)
            raise
        except BaseException:
            self.close()
            raise

    def close(self):
        self.closed = True
        close = getattr(self.content, 'close', None)
        if close:
            close()


class ChunkBuffer:
    def __init__(self):
        self.chunks = deque()
        self.position = 0

    def write(self, data):
        self.position += len(data)
        if data:
            self.chunks.append(data)
        return len(data)

    def tell(self):
        return self.position

    def flush(self):
        pass

    def drain(self):
        while self.chunks:
            yield self.chunks.popleft()


def release_archive(files, manifest):
    output = ChunkBuffer()
    # ZIP_STORED avoids spending CPU recompressing already-compressed weights/data.
    # ZIP64 supports model weights larger than 4 GiB. At most one input is open.
    with zipfile.ZipFile(output, 'w', compression=zipfile.ZIP_STORED, allowZip64=True) as archive:
        archive.writestr('manifest.json', json.dumps(manifest, indent=2, ensure_ascii=False).encode('utf-8'))
        yield from output.drain()
        for item in files:
            name = 'files/' + safe_path(item.path)
            with storage().open(item.storage_key, 'rb') as source, archive.open(name, 'w', force_zip64=True) as destination:
                yield from output.drain()
                while chunk := source.read(64 * 1024):
                    destination.write(chunk)
                    yield from output.drain()
            yield from output.drain()
    yield from output.drain()
