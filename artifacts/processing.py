from datetime import timedelta
import logging
import uuid

from django.db import transaction
from django.utils import timezone
from .models import Artifact, ArtifactDeletion
from .storage import storage
from .validation import validate_blob

logger = logging.getLogger(__name__)


def process_one():
    with transaction.atomic():
        # An expired validation lease can be reclaimed after a worker crash.
        Artifact.objects.filter(status='validating', expires_at__lt=timezone.now()).update(status='uploaded')
        item = Artifact.objects.select_for_update(skip_locked=True).filter(status='uploaded').order_by('created_at').first()
        if item is None:
            return False
        item.status, item.lease = 'validating', uuid.uuid4()
        item.expires_at = timezone.now() + timedelta(hours=2)
        item.save(update_fields=['status', 'lease', 'expires_at'])
    try:
        # Filesystem artifacts are seekable; no additional staging copy is needed.
        with storage().open(item.storage_key, 'rb') as source:
            size, checksum, scan = validate_blob(item, source)
        Artifact.objects.filter(pk=item.pk, lease=item.lease, status='validating').update(
            status='ready', size=size, sha256=checksum, scan_status=scan, validated_at=timezone.now(), error='',
        )
    except Exception as error:
        # Do not expose infrastructure paths, credentials or scanner diagnostics.
        detail = str(error)[:500] if isinstance(error, (ValueError, UnicodeError)) else 'Validation service failed. Cancel this upload and retry after checking the worker.'
        Artifact.objects.filter(pk=item.pk, lease=item.lease, status='validating').update(status='rejected', scan_status='failed', error=detail)
        logger.warning('Artifact %s validation failed (%s).', item.pk, type(error).__name__)
    return True


def cleanup_expired():
    Artifact.objects.filter(status__in=['pending', 'receiving'], expires_at__lt=timezone.now()).update(status='cancelled', error='Upload session expired.')
    for item in Artifact.objects.filter(status='cancelled').exclude(storage_key='').iterator(chunk_size=100):
        try:
            storage().delete(item.storage_key)
        except Exception:
            logger.warning('Artifact %s storage cleanup will be retried.', item.pk)
        else:
            Artifact.objects.filter(pk=item.pk, status='cancelled', storage_key=item.storage_key).update(storage_key='')
    cleanup_deleted()


def cleanup_deleted():
    # Idempotent storage deletes are retried after outages or worker crashes.
    # Keep filesystem work outside database transactions and bound each batch.
    for item in ArtifactDeletion.objects.order_by('created_at', 'pk')[:100]:
        try:
            storage().delete(item.storage_key)
        except Exception:
            logger.warning('Repository file cleanup %s will be retried.', item.pk)
        else:
            item.delete()
