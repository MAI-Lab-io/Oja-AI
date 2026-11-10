from allauth.account.adapter import DefaultAccountAdapter
from allauth.socialaccount.adapter import DefaultSocialAccountAdapter
from allauth.headless.adapter import DefaultHeadlessAdapter
from django.conf import settings
from django.utils import timezone
from types import SimpleNamespace
from urllib.parse import urlsplit
from .models import OutgoingEmail


class AccountAdapter(DefaultAccountAdapter):
    def send_mail(self, template_prefix, email, context):
        # Keep the normal allauth email/site context when using our durable outbox.
        mail_context = {
            **context,
            'email': email,
            'current_site': SimpleNamespace(name=settings.PLATFORM_NAME, domain=urlsplit(settings.FRONTEND_URL).netloc),
            'login_url': settings.FRONTEND_URL + '/auth/login?next=connections',
            'connections_url': settings.FRONTEND_URL + '/auth/connections',
        }
        message = self.render_mail(template_prefix, email, mail_context)
        html = next((part.content for part in message.alternatives if part.mimetype == 'text/html'), '')
        OutgoingEmail.objects.create(
            subject=message.subject, body=message.body, html=html,
            sender=message.from_email, recipients=message.to, available_at=timezone.now(),
        )


class SocialAccountAdapter(DefaultSocialAccountAdapter):
    def get_connect_redirect_url(self, request, socialaccount):
        # The standard connections view is deliberately absent in headless mode.
        return settings.FRONTEND_URL + '/auth/connections'


class HeadlessAdapter(DefaultHeadlessAdapter):
    def serialize_user(self, user):
        return {**super().serialize_user(user), 'first_name': user.first_name, 'last_name': user.last_name}
