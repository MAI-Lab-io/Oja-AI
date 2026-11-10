import time
from datetime import timedelta
from django.conf import settings
from django.core.mail import EmailMultiAlternatives
from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone
from accounts.models import OutgoingEmail


class Command(BaseCommand):
    help = 'Deliver authentication email from the outbox; use --once for one batch.'

    def add_arguments(self, parser):
        parser.add_argument('--once', action='store_true')

    def handle(self, *args, **options):
        backend = settings.MAILERS['default']['BACKEND']
        self.stdout.write(f'Account email worker started. Backend: {backend}')
        if backend == 'django.core.mail.backends.console.EmailBackend':
            self.stderr.write(
                'WARNING: Standard console email may encode/split links. '
                'Use accounts.mail_backends.ReadableConsoleEmailBackend for local testing.'
            )
        while True:
            delivered = 0
            for _ in range(100):
                with transaction.atomic():
                    queued = OutgoingEmail.objects.select_for_update(skip_locked=True).filter(
                        available_at__lte=timezone.now(), attempts__lt=5,
                    ).order_by('available_at').first()
                    if queued is None:
                        break
                    message = EmailMultiAlternatives(queued.subject, queued.body, queued.sender, queued.recipients)
                    if queued.html:
                        message.attach_alternative(queued.html, 'text/html')
                    try:
                        message.send()
                    except Exception:
                        queued.attempts += 1
                        queued.available_at = timezone.now() + timedelta(seconds=30 * 2 ** queued.attempts)
                        queued.save(update_fields=['attempts', 'available_at'])
                        self.stderr.write(f'Email {queued.pk} delivery failed (attempt {queued.attempts}/5).')
                    else:
                        queued.delete()
                        delivered += 1
            if delivered:
                self.stdout.write(f'Delivered {delivered} account email(s).')
            if options['once']:
                return
            time.sleep(2)
