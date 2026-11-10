import uuid
from django.conf import settings
from django.db import models
from django.db.models.functions import Lower


class Release(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    repository = models.ForeignKey('repositories.Repository', on_delete=models.PROTECT, related_name='releases')
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    version = models.CharField(max_length=80)
    parent = models.ForeignKey('self', null=True, blank=True, on_delete=models.PROTECT)
    status = models.CharField(max_length=10, choices=[('draft', 'Draft'), ('published', 'Published')], default='draft')
    metadata_schema = models.CharField(max_length=30, default='oja.card.v1', editable=False)
    metadata = models.JSONField(default=dict)
    card = models.TextField(max_length=100000, blank=True)
    changelog = models.TextField(max_length=10000, blank=True)
    rights_confirmed = models.BooleanField(default=False)
    manifest = models.JSONField(default=dict, editable=False)
    manifest_sha256 = models.CharField(max_length=64, blank=True, editable=False)
    created_at = models.DateTimeField(auto_now_add=True)
    published_at = models.DateTimeField(null=True, editable=False)

    class Meta:
        constraints = [models.UniqueConstraint('repository', Lower('version'), name='release_repo_version_ci_unique')]
        indexes = [models.Index(fields=['repository', '-created_at']), models.Index(fields=['status', '-published_at'])]


class SourceLink(models.Model):
    release = models.ForeignKey(Release, on_delete=models.CASCADE, related_name='sources')
    source = models.ForeignKey(Release, on_delete=models.PROTECT, related_name='derived_releases')
    relation = models.CharField(max_length=12, choices=[('derived_from', 'Derived from'), ('trained_on', 'Trained on')])

    class Meta:
        constraints = [models.UniqueConstraint(fields=['release', 'source', 'relation'], name='release_source_relation_unique')]


class ReleaseEvent(models.Model):
    release = models.ForeignKey(Release, on_delete=models.PROTECT, related_name='events')
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    action = models.CharField(max_length=40)
    created_at = models.DateTimeField(auto_now_add=True)
