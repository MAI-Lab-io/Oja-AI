import uuid
from django.conf import settings
from django.db import models
from django.db.models.functions import Lower


class Repository(models.Model):
    class Kind(models.TextChoices):
        MODEL = 'model', 'Model'
        DATASET = 'dataset', 'Dataset'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name='repositories')
    kind = models.CharField(max_length=7, choices=Kind.choices)
    name = models.CharField(max_length=150)
    slug = models.SlugField(max_length=100)
    description = models.TextField(max_length=5000, blank=True)
    download_count = models.PositiveBigIntegerField(default=0, editable=False)
    download_request_count = models.PositiveBigIntegerField(default=0, editable=False)
    visibility = models.CharField(max_length=7, choices=[('private', 'Private'), ('public', 'Public')], default='private')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [models.UniqueConstraint('owner', Lower('slug'), name='repo_owner_slug_ci_unique')]
        indexes = [models.Index(fields=['owner', '-created_at']), models.Index(fields=['kind', 'visibility'])]
