import time
from django.core.management.base import BaseCommand
from django.conf import settings
from artifacts.processing import process_one, cleanup_expired


class Command(BaseCommand):
    help = 'Validate queued uploads, calculate checksums and scan files.'

    def add_arguments(self, parser):
        parser.add_argument('--once', action='store_true')

    def handle(self, *args, **options):
        self.stdout.write(f'Upload validator started. Scan mode: {settings.UPLOAD_SCAN_MODE}')
        while True:
            cleanup_expired()
            processed = 0
            for _ in range(100):
                if not process_one():
                    break
                processed += 1
            if processed:
                self.stdout.write(f'Processed {processed} upload(s).')
            if options['once']:
                return
            time.sleep(2)
