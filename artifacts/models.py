import uuid
from django.db import models
from django.db.models.functions import Lower
from django.conf import settings


class Artifact(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    release = models.ForeignKey('releases.Release', on_delete=models.PROTECT, related_name='files')
    path = models.CharField(max_length=512)
    declared_size = models.PositiveBigIntegerField()
    expected_sha256 = models.CharField(max_length=64, blank=True)
    storage_key = models.CharField(max_length=200, blank=True, editable=False)
    size = models.PositiveBigIntegerField(default=0)
    sha256 = models.CharField(max_length=64, blank=True)
    status = models.CharField(max_length=12, choices=[(s, s) for s in ['pending', 'receiving', 'uploaded', 'validating', 'ready', 'rejected', 'cancelled']], default='pending')
    scan_status = models.CharField(max_length=12, default='pending')
    validation_profile = models.CharField(max_length=30, default='oja.file.v1', editable=False)
    validated_at = models.DateTimeField(null=True, editable=False)
    error = models.CharField(max_length=1000, blank=True)
    lease = models.UUIDField(null=True)
    expires_at = models.DateTimeField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint('release', Lower('path'), condition=~models.Q(status='cancelled'), name='artifact_release_path_ci_unique'),
            models.CheckConstraint(condition=models.Q(declared_size__gt=0), name='artifact_positive_size'),
        ]
        indexes = [models.Index(fields=['status', 'created_at']), models.Index(fields=['expires_at'])]


class ArtifactDeletion(models.Model):
    """Durable cleanup after a repository and its artifact records are removed."""
    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    storage_key = models.CharField(max_length=200, unique=True)
    declared_size = models.PositiveBigIntegerField()
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
