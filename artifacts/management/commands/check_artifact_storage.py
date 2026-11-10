import secrets
from pathlib import Path
from django.conf import settings
from django.core.files.base import ContentFile
from django.core.management.base import BaseCommand, CommandError
from artifacts.storage import storage


class Command(BaseCommand):
    help = 'Check private file storage; --initialize writes a marker to an existing configured directory.'

    def add_arguments(self, parser):
        parser.add_argument('--initialize', action='store_true')

    def handle(self, *args, **options):
        if options['initialize']:
            if not settings.ARTIFACT_STORAGE_ROOT:
                raise CommandError('Set ARTIFACT_STORAGE_ROOT to a private storage directory first.')
            root = Path(settings.ARTIFACT_STORAGE_ROOT)
            if not root.is_dir():
                raise CommandError('The configured private storage directory must already exist.')
            marker = root / '.oja-storage-root'
            if not marker.exists():
                with marker.open('x', encoding='utf-8') as stream:
                    stream.write('oja-artifacts-v1\n')
        backend = storage()
        key = ''
        try:
            key = backend.save(f'healthchecks/{secrets.token_hex(16)}', ContentFile(b'oja-storage-check'))
            with backend.open(key, 'rb') as stream:
                if stream.read() != b'oja-storage-check':
                    raise CommandError('Storage read-back did not match.')
        except Exception as error:
            raise CommandError(f'Storage check failed ({type(error).__name__}). Check the directory, marker and service permissions.') from error
        finally:
            if key:
                backend.delete(key)
        self.stdout.write(self.style.SUCCESS('Private artifact storage: write/read/delete checks passed.'))
