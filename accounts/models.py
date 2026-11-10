import uuid
from django.contrib.auth.models import AbstractUser, UserManager
from django.db import models
from django.db.models.functions import Lower, Upper


class AccountManager(UserManager):
    def normalize_email(self, email):
        return super().normalize_email(email).strip().lower()


class User(AbstractUser):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    email = models.EmailField(unique=True)
    objects = AccountManager()

    class Meta:
        # Django's PostgreSQL __iexact lookups use UPPER(), including allauth login.
        indexes = [models.Index(Upper('email'), name='accounts_user_email_upper_idx')]
        constraints = [
            models.UniqueConstraint(Lower('email'), name='accounts_user_email_ci_unique'),
            models.UniqueConstraint(Lower('username'), name='accounts_user_username_ci_unique'),
        ]

    def save(self, *args, **kwargs):
        self.email = self.__class__.objects.normalize_email(self.email)
        return super().save(*args, **kwargs)


class OutgoingEmail(models.Model):
    """Durable outbox: authentication requests never wait for SMTP delivery."""
    subject = models.CharField(max_length=998)
    body = models.TextField()
    html = models.TextField(blank=True)
    sender = models.CharField(max_length=320)
    recipients = models.JSONField()
    created_at = models.DateTimeField(auto_now_add=True)
    available_at = models.DateTimeField()
    attempts = models.PositiveSmallIntegerField(default=0)

    class Meta:
        indexes = [models.Index(fields=['available_at'], name='accounts_email_available_idx')]
