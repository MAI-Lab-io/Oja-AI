import re
from datetime import datetime, timedelta
from io import StringIO
from unittest.mock import patch
from urllib.parse import parse_qs, urlparse

from allauth.account.models import EmailAddress
from django.contrib.auth.tokens import PasswordResetTokenGenerator
from django.core import mail
from django.core.cache import cache
from django.core.management import call_command
from django.db import IntegrityError, transaction
from django.test import Client, TestCase, override_settings
from django.utils import timezone

from .models import OutgoingEmail, User

AUTH = '/_allauth/browser/v1/auth/'
PASSWORD = 'Cedar-river-754!long'
NEW_PASSWORD = 'Mountain-lake-864!long'


class AccountFlowTests(TestCase):
    def setUp(self):
        cache.clear()
        self.client = Client(enforce_csrf_checks=True)

    def post(self, path, data=None, client=None, method='post'):
        client = client or self.client
        token = client.get('/api/v1/accounts/csrf/').json()['csrfToken']
        return getattr(client, method)(path, data or {}, content_type='application/json', HTTP_X_CSRFTOKEN=token)

    def create_user(self, verified=True, **kwargs):
        user = User.objects.create_user(username=kwargs.pop('username', 'alice'), email=kwargs.pop('email', 'alice@example.com'), password=PASSWORD, **kwargs)
        EmailAddress.objects.create(user=user, email=user.email, primary=True, verified=verified)
        return user

    def email_key(self, path):
        queued = OutgoingEmail.objects.filter(body__contains=path).latest('pk')
        url = re.search(r'http://localhost:3000' + re.escape(path) + r'\?key=\S+', queued.body).group()
        return parse_qs(urlparse(url).query)['key'][0]

    def test_signup_verification_login_restore_and_logout(self):
        response = self.post(AUTH + 'signup', {'email': 'ALICE@Example.com', 'username': 'alice', 'password': PASSWORD, 'first_name': 'Alice', 'last_name': 'Researcher'})
        self.assertEqual(response.status_code, 401, response.content)
        user = User.objects.get(username='alice')
        self.assertEqual(user.email, 'alice@example.com')
        self.assertEqual(user.first_name, 'Alice')
        self.assertEqual(user.last_name, 'Researcher')
        self.assertNotEqual(user.password, PASSWORD)
        self.assertTrue(user.password.startswith('argon2$'))
        self.assertEqual(self.client.get('/api/v1/accounts/contribution-access/').status_code, 403)
        key = self.email_key('/auth/verify-email')
        queued = OutgoingEmail.objects.filter(body__contains='/auth/verify-email').latest('pk')
        self.assertIn('Hello from Oja AI!', queued.body)
        self.assertIn('Thank you for using Oja AI!', queued.body)
        self.assertTrue(queued.subject.startswith('[Oja AI]'))
        # The link also works in a fresh browser without the signup session.
        other_browser = Client(enforce_csrf_checks=True)
        verified = self.post(AUTH + 'email/verify', {'key': key}, client=other_browser)
        self.assertIn(verified.status_code, (200, 401), verified.content)
        self.assertTrue(EmailAddress.objects.get(user=user).verified)
        self.assertEqual(self.post(AUTH + 'email/verify', {'key': key}).status_code, 400)
        login = self.post(AUTH + 'login', {'email': 'ALICE@example.com', 'password': PASSWORD})
        self.assertEqual(login.status_code, 200, login.content)
        restored = self.client.get('/api/v1/accounts/me/')
        self.assertEqual(restored.json()['user']['id'], str(user.pk))
        self.assertNotIn('password', restored.json()['user'])
        self.assertTrue(self.client.cookies['sessionid']['httponly'])
        self.assertEqual(self.client.get('/api/v1/accounts/contribution-access/').status_code, 200)
        old_session = self.client.cookies['sessionid'].value
        self.assertEqual(self.post(AUTH + 'session', method='delete').status_code, 401)
        self.assertEqual(self.client.get('/api/v1/accounts/me/').status_code, 403)
        attacker = Client()
        attacker.cookies['sessionid'] = old_session
        self.assertEqual(attacker.get('/api/v1/accounts/me/').status_code, 403)

    def test_csrf_required_for_signup_login_and_logout(self):
        for endpoint, method in [('signup', 'post'), ('login', 'post'), ('session', 'delete')]:
            response = getattr(self.client, method)(AUTH + endpoint, {}, content_type='application/json')
            self.assertEqual(response.status_code, 403)
        response = self.client.post('/api/v1/accounts/resend-verification/', {}, content_type='application/json')
        self.assertEqual(response.status_code, 403)

    def test_signup_requires_both_names_and_rejects_whitespace(self):
        base = {'email': 'alice@example.com', 'username': 'alice', 'password': PASSWORD, 'first_name': 'Alice', 'last_name': 'Researcher'}
        for field in ('first_name', 'last_name'):
            for value in (None, '', '   '):
                with self.subTest(field=field, value=value):
                    payload = dict(base)
                    if value is None:
                        payload.pop(field)
                    else:
                        payload[field] = value
                    response = self.post(AUTH + 'signup', payload)
                    self.assertEqual(response.status_code, 400, response.content)
                    self.assertFalse(User.objects.exists())
                    self.assertFalse(OutgoingEmail.objects.exists())

    def test_password_reset_is_generic_single_use_and_invalidates_sessions(self):
        user = self.create_user()
        self.assertEqual(self.post(AUTH + 'login', {'email': user.email, 'password': PASSWORD}).status_code, 200)
        response = self.post(AUTH + 'password/request', {'email': user.email})
        unknown = self.post(AUTH + 'password/request', {'email': 'unknown@example.com'})
        self.assertEqual(response.status_code, unknown.status_code)
        self.assertEqual(response.json(), unknown.json())
        key = self.email_key('/auth/reset-password')
        reset_browser = Client(enforce_csrf_checks=True)
        reset = self.post(AUTH + 'password/reset', {'key': key, 'password': NEW_PASSWORD}, client=reset_browser)
        self.assertIn(reset.status_code, (200, 401), reset.content)
        self.assertEqual(self.client.get('/api/v1/accounts/me/').status_code, 403)
        reused = self.post(AUTH + 'password/reset', {'key': key, 'password': PASSWORD}, client=reset_browser)
        self.assertEqual(reused.status_code, 400)
        user.refresh_from_db()
        self.assertTrue(user.check_password(NEW_PASSWORD))
        self.assertFalse(user.check_password(PASSWORD))
        self.assertTrue(OutgoingEmail.objects.filter(subject__icontains='password').exists())

    def test_expired_reset_and_verification_tokens_are_rejected(self):
        self.create_user(verified=False)
        self.post(AUTH + 'login', {'email': 'alice@example.com', 'password': PASSWORD})
        verification = self.email_key('/auth/verify-email')
        with patch('django.core.signing.time.time', return_value=timezone.now().timestamp() + 172800):
            response = self.post(AUTH + 'email/verify', {'key': verification})
        self.assertEqual(response.status_code, 400)
        self.post(AUTH + 'password/request', {'email': 'alice@example.com'})
        key = self.email_key('/auth/reset-password')
        with patch.object(PasswordResetTokenGenerator, '_now', return_value=datetime.now() + timedelta(hours=2)):
            response = self.post(AUTH + 'password/reset', {'key': key, 'password': NEW_PASSWORD})
        self.assertEqual(response.status_code, 400)

    def test_permissions_use_server_staff_flag_and_verified_email(self):
        user = self.create_user(verified=False, email='admin@oja.ai')
        self.client.force_login(user)
        self.assertEqual(self.client.get('/api/v1/accounts/contribution-access/').status_code, 403)
        self.assertEqual(self.client.get('/api/v1/accounts/admin-access/').status_code, 403)
        user.is_staff = True
        user.save()
        self.assertEqual(self.client.get('/api/v1/accounts/admin-access/').status_code, 200)

    def test_unverified_and_disabled_users_cannot_log_in(self):
        user = self.create_user(verified=False)
        self.assertEqual(self.post(AUTH + 'login', {'email': user.email, 'password': PASSWORD}).status_code, 401)
        self.assertEqual(self.client.get('/api/v1/accounts/me/').status_code, 403)
        user.is_active = False
        user.save()
        denied = self.post(AUTH + 'login', {'email': user.email, 'password': PASSWORD})
        self.assertIn(denied.status_code, (400, 401))
        self.assertFalse(denied.json().get('meta', {}).get('is_authenticated', False))
        self.assertEqual(self.client.get('/api/v1/accounts/me/').status_code, 403)

    def test_database_enforces_case_insensitive_identity(self):
        self.create_user()
        for values in [dict(username='bob', email='ALICE@EXAMPLE.COM'), dict(username='ALICE', email='bob@example.com')]:
            with self.assertRaises(IntegrityError), transaction.atomic():
                User.objects.create_user(password=PASSWORD, **values)

    def test_password_policy_and_invalid_token(self):
        response = self.post(AUTH + 'signup', {'first_name': 'Alice', 'last_name': 'Researcher', 'email': 'alice@example.com', 'username': 'alice', 'password': 'short'})
        self.assertEqual(response.status_code, 400)
        self.assertEqual(User.objects.count(), 0)
        self.assertEqual(self.post(AUTH + 'password/reset', {'key': 'invalid', 'password': NEW_PASSWORD}).status_code, 400)

    @override_settings(ACCOUNT_RATE_LIMITS={'login': '2/m/ip'})
    def test_login_rate_limit(self):
        for _ in range(2):
            self.post(AUTH + 'login', {'email': 'missing@example.com', 'password': PASSWORD})
        response = self.post(AUTH + 'login', {'email': 'missing@example.com', 'password': PASSWORD})
        self.assertEqual(response.status_code, 429)

    def test_resend_requires_pending_session_and_obeys_cooldown(self):
        self.assertEqual(self.post('/api/v1/accounts/resend-verification/').status_code, 409)
        self.post(AUTH + 'signup', {'first_name': 'Alice', 'last_name': 'Researcher', 'email': 'alice@example.com', 'username': 'alice', 'password': PASSWORD})
        self.assertEqual(self.post('/api/v1/accounts/resend-verification/').status_code, 429)
        cache.clear()
        response = self.post('/api/v1/accounts/resend-verification/')
        self.assertEqual(response.status_code, 200, response.content)

    def test_password_change_requires_current_password(self):
        user = self.create_user()
        self.post(AUTH + 'login', {'email': user.email, 'password': PASSWORD})
        path = '/_allauth/browser/v1/account/password/change'
        self.assertEqual(self.post(path, {'current_password': 'wrong', 'new_password': NEW_PASSWORD}).status_code, 400)
        response = self.post(path, {'current_password': PASSWORD, 'new_password': NEW_PASSWORD})
        self.assertIn(response.status_code, (200, 401), response.content)
        self.assertEqual(self.client.get('/api/v1/accounts/me/').status_code, 403)

    def test_outbox_delivers_and_retries_without_losing_messages(self):
        queued = OutgoingEmail.objects.create(subject='Account test', body='Test message', sender='noreply@example.com', recipients=['alice@example.com'], available_at=timezone.now())
        with patch('django.core.mail.EmailMultiAlternatives.send', side_effect=OSError('SMTP unavailable')):
            call_command('deliver_account_email', once=True, stdout=StringIO(), stderr=StringIO())
        queued.refresh_from_db()
        self.assertEqual(queued.attempts, 1)
        self.assertGreater(queued.available_at, timezone.now())
        queued.available_at = timezone.now()
        queued.save()
        call_command('deliver_account_email', once=True, stdout=StringIO())
        self.assertFalse(OutgoingEmail.objects.exists())
        self.assertEqual(mail.outbox[-1].subject, 'Account test')

    def test_verification_link_copied_from_console_output_is_valid(self):
        self.post(AUTH + 'signup', {'first_name': 'Alice', 'last_name': 'Researcher', 'email': 'alice@example.com', 'username': 'alice', 'password': PASSWORD})
        output = StringIO()
        with override_settings(MAILERS={'default': {
            'BACKEND': 'accounts.mail_backends.ReadableConsoleEmailBackend',
            'OPTIONS': {'stream': output},
        }}):
            call_command('deliver_account_email', once=True, stdout=StringIO())
        printed = output.getvalue()
        url = re.search(r'http://localhost:3000/auth/verify-email\?key=\S+', printed).group()
        self.assertNotIn('Content-Transfer-Encoding:', printed)
        self.assertNotIn('?key=3D', printed)
        key = parse_qs(urlparse(url).query)['key'][0]
        response = self.post(AUTH + 'email/verify', {'key': key})
        self.assertIn(response.status_code, (200, 401), response.content)
        self.assertTrue(EmailAddress.objects.get(email='alice@example.com').verified)

    def test_reset_link_copied_from_console_output_is_valid(self):
        user = self.create_user()
        self.post(AUTH + 'password/request', {'email': user.email})
        output = StringIO()
        with override_settings(MAILERS={'default': {
            'BACKEND': 'accounts.mail_backends.ReadableConsoleEmailBackend',
            'OPTIONS': {'stream': output},
        }}):
            call_command('deliver_account_email', once=True, stdout=StringIO())
        url = re.search(r'http://localhost:3000/auth/reset-password\?key=\S+', output.getvalue()).group()
        key = parse_qs(urlparse(url).query)['key'][0]
        response = self.post(AUTH + 'password/reset', {'key': key, 'password': NEW_PASSWORD})
        self.assertIn(response.status_code, (200, 401), response.content)
        user.refresh_from_db()
        self.assertTrue(user.check_password(NEW_PASSWORD))
