from pathlib import Path
from django.conf import settings
from django.core.exceptions import ImproperlyConfigured
from django.core.files.storage import FileSystemStorage


class PrivateArtifactStorage(FileSystemStorage):
    """Private filesystem storage with fail-closed root verification."""
    def ensure_available(self):
        if settings.ARTIFACT_STORAGE_ROOT:
            marker = Path(self.location) / '.oja-storage-root'
            if not marker.is_file() or marker.read_text(encoding='utf-8').strip() != 'oja-artifacts-v1':
                raise ImproperlyConfigured('Artifact storage is unavailable or its .oja-storage-root marker is missing.')

    def _open(self, name, mode='rb'):
        self.ensure_available()
        return super()._open(name, mode)

    def _save(self, name, content):
        self.ensure_available()
        return super()._save(name, content)

    def delete(self, name):
        self.ensure_available()
        return super().delete(name)

    def url(self, name):
        raise NotImplementedError('Artifacts are private; use the authorized download endpoint.')
