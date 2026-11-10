from django.conf import settings
from django.core.files import File
from rest_framework.exceptions import ValidationError


class BoundedRequestFile(File):
    """Stream HTTP bytes directly into private file storage with a strict bound."""
    def __init__(self, request, expected_size):
        super().__init__(request, name='upload')
        self.expected_size = expected_size

    def chunks(self, chunk_size=None):
        total = 0
        while chunk := self.file.read(64 * 1024):
            total += len(chunk)
            if total > self.expected_size or total > settings.UPLOAD_MAX_FILE_BYTES:
                raise ValidationError('File exceeds its declared size.')
            yield chunk
        if total != self.expected_size:
            raise ValidationError('The upload was incomplete.')
