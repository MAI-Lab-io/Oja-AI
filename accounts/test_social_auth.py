from urllib.parse import parse_qs, urlparse
from unittest.mock import patch

from allauth.account.models import EmailAddress
from allauth.socialaccount.adapter import get_adapter
from allauth.socialaccount.models import SocialAccount, SocialApp
from django.core.cache import cache
from django.test import Client, TestCase, override_settings

from .models import User, OutgoingEmail


PROVIDERS = {
    'google': {'APP': {'client_id': 'google-test', 'secret': 'test-secret'}, 'OAUTH_PKCE_ENABLED': True},
    'github': {'APP': {'client_id': 'github-test', 'secret': 'test-secret'}, 'SCOPE': ['user:email'], 'OAUTH_PKCE_ENABLED': True},
}
AUTH = '/_allauth/browser/v1/auth/'


@override_settings(SOCIALACCOUNT_PROVIDERS=PROVIDERS)
class SocialAuthTests(TestCase):
    def setUp(self):
        cache.clear()
        self.client = Client(enforce_csrf_checks=True)

    def post(self, path, data, json=True):
        token = self.client.get('/api/v1/accounts/csrf/').json()['csrfToken']
        kwargs = {'HTTP_X_CSRFTOKEN': token}
        if json:
            kwargs['content_type'] = 'application/json'
        return self.client.post(path, data, **kwargs)

    def pending_signup(self, provider, email='', verified=True):
        # Simulate a completed, validated provider handshake, not provider HTTP calls.
        from django.test import RequestFactory
        request = RequestFactory().get('/')
        data = {'sub': 'google-user-1', 'email': email, 'email_verified': verified, 'name': 'Researcher', 'given_name': 'Researcher'} if provider == 'google' else {
            'id': 12345, 'login': 'researcher', 'name': 'Researcher',
            'emails': [{'email': email, 'primary': True, 'verified': verified}] if email else [],
        }
        sociallogin = get_adapter().get_provider(request, provider).sociallogin_from_response(request, data)
        session = self.client.session
        session['socialaccount_sociallogin'] = sociallogin.serialize()
        session.save()

    def test_configuration_exposes_only_public_provider_details(self):
        response = self.client.get('/_allauth/browser/v1/config')
        self.assertEqual(response.status_code, 200)
        self.assertEqual({p['id'] for p in response.json()['data']['socialaccount']['providers']}, {'google', 'github'})
        self.assertNotIn('test-secret', response.content.decode())

    def test_provider_signup_requires_names_and_exposes_prefill(self):
        self.pending_signup('google', 'researcher@example.com')
        prefill = self.client.get(AUTH + 'provider/signup').json()['data']['user']
        self.assertEqual(prefill['first_name'], 'Researcher')
        self.assertEqual(prefill['last_name'], '')
        response = self.post(AUTH + 'provider/signup', {'username': 'researcher', 'email': 'researcher@example.com'})
        self.assertEqual(response.status_code, 400, response.content)
        self.assertFalse(User.objects.exists())

    def test_redirect_requires_csrf_and_issues_state(self):
        for provider in ('google', 'github'):
            data = {'provider': provider, 'process': 'login', 'callback_url': 'http://localhost:3000/auth/provider-callback'}
            self.assertEqual(self.client.post(AUTH + 'provider/redirect', data).status_code, 403)
            response = self.post(AUTH + 'provider/redirect', data, json=False)
            self.assertEqual(response.status_code, 302)
            query = parse_qs(urlparse(response.url).query)
            self.assertTrue(query['state'][0])
            self.assertEqual(query['redirect_uri'], [f'http://testserver/accounts/{provider}/login/callback/'])
            self.assertTrue(query['code_challenge'][0])

    def test_github_signup_trusts_only_verified_provider_email(self):
        self.pending_signup('github', 'researcher@example.com', verified=False)
        response = self.post(AUTH + 'provider/signup', {'first_name': 'Research', 'last_name': 'User', 'username': 'researcher', 'email': 'researcher@example.com'})
        self.assertEqual(response.status_code, 401, response.content)
        self.assertFalse(EmailAddress.objects.get(email='researcher@example.com').verified)
        self.assertEqual(SocialAccount.objects.get().provider, 'github')
        self.assertEqual(self.client.get('/api/v1/accounts/me/').status_code, 403)

    def test_github_does_not_merge_existing_accounts_by_email(self):
        user = User.objects.create_user(username='existing', email='researcher@example.com')
        EmailAddress.objects.create(user=user, email=user.email, primary=True, verified=True)
        self.pending_signup('github', user.email)
        response = self.post(AUTH + 'provider/signup', {'first_name': 'Research', 'last_name': 'User', 'username': 'researcher', 'email': user.email})
        self.assertIn(response.status_code, (400, 401))
        self.assertEqual(User.objects.count(), 1)
        self.assertFalse(SocialAccount.objects.exists())

    def test_csrf_endpoint_prevents_caching_and_recovers_from_stale_token(self):
        self.client.cookies['csrftoken'] = 'a' * 32
        response = self.client.get('/api/v1/accounts/csrf/')
        self.assertIn('no-store', response['Cache-Control'])
        token = response.json()['csrfToken']
        data = {'provider': 'google', 'process': 'login', 'callback_url': 'http://localhost:3000/auth/provider-callback', 'csrfmiddlewaretoken': 'b' * 32}
        self.assertEqual(self.client.post(AUTH + 'provider/redirect', data).status_code, 403)
        data['csrfmiddlewaretoken'] = token
        response = self.client.post(AUTH + 'provider/redirect', data)
        self.assertEqual(response.status_code, 302)
        self.assertEqual(urlparse(response.url).netloc, 'accounts.google.com')

    def test_provider_form_rejects_null_origin_and_accepts_frontend_origin(self):
        token = self.client.get('/api/v1/accounts/csrf/').json()['csrfToken']
        data = {'provider': 'google', 'process': 'login', 'callback_url': 'http://localhost:3000/auth/provider-callback', 'csrfmiddlewaretoken': token}
        # Browser navigation POSTs under no-referrer can have Origin: null,
        # unlike fetch(), so a valid token alone cannot make them succeed.
        response = self.client.post(AUTH + 'provider/redirect', data, HTTP_ORIGIN='null')
        self.assertEqual(response.status_code, 403)
        response = self.client.post(AUTH + 'provider/redirect', data, HTTP_ORIGIN='http://localhost:3000', HTTP_REFERER='http://localhost:3000/auth/login')
        self.assertEqual(response.status_code, 302)
        self.assertEqual(urlparse(response.url).netloc, 'accounts.google.com')

    def test_untrusted_callback_and_unknown_provider_are_rejected(self):
        for provider, callback in [('google', 'https://attacker.example/callback'), ('unknown', 'http://localhost:3000/auth/provider-callback')]:
            response = self.post(AUTH + 'provider/redirect', {'provider': provider, 'process': 'login', 'callback_url': callback}, json=False)
            self.assertEqual(response.status_code, 302)
            self.assertTrue(response.url.startswith('http://localhost:3000/auth/provider-callback?error='))
            self.assertNotIn('attacker.example', response.url)

    def test_provider_signup_without_email_requires_and_verifies_email(self):
        self.pending_signup('google', verified=False)
        self.assertEqual(self.client.get(AUTH + 'provider/signup').status_code, 200)
        response = self.post(AUTH + 'provider/signup', {'first_name': 'Research', 'last_name': 'User', 'username': 'researcher'})
        self.assertEqual(response.status_code, 400)
        self.assertFalse(User.objects.exists())
        response = self.post(AUTH + 'provider/signup', {'first_name': 'Research', 'last_name': 'User', 'username': 'researcher', 'email': 'researcher@example.com'})
        self.assertEqual(response.status_code, 401, response.content)
        user = User.objects.get(username='researcher')
        self.assertFalse(user.has_usable_password())
        self.assertFalse(EmailAddress.objects.get(user=user).verified)
        self.assertEqual(SocialAccount.objects.get(user=user).provider, 'google')
        self.assertTrue(OutgoingEmail.objects.exists())
        self.assertEqual(self.client.get('/api/v1/accounts/me/').status_code, 403)

    def test_orcid_linking_is_unavailable(self):
        response = self.post(AUTH + 'provider/redirect', {'provider': 'orcid', 'process': 'connect', 'callback_url': 'http://localhost:3000/auth/provider-callback'}, json=False)
        self.assertEqual(response.status_code, 302)
        self.assertIn('error=', response.url)
        self.assertEqual(self.client.get('/accounts/orcid/login/callback/').status_code, 404)

    def test_google_verified_signup_and_changed_email(self):
        self.pending_signup('google', 'researcher@example.com')
        response = self.post(AUTH + 'provider/signup', {'first_name': 'Research', 'last_name': 'User', 'username': 'researcher', 'email': 'researcher@example.com'})
        self.assertEqual(response.status_code, 200, response.content)
        self.assertTrue(EmailAddress.objects.get(email='researcher@example.com').verified)
        self.assertEqual(self.client.get('/api/v1/accounts/contribution-access/').status_code, 200)
        self.assertEqual(self.client.get('/_allauth/browser/v1/account/providers').status_code, 200)
        self.assertFalse(SocialApp.objects.exists())  # Credentials are environment-backed.

    def test_provider_verified_email_cannot_verify_a_different_email(self):
        self.pending_signup('google', 'original@example.com')
        response = self.post(AUTH + 'provider/signup', {'first_name': 'Research', 'last_name': 'User', 'username': 'researcher', 'email': 'changed@example.com'})
        # allauth retains the provider's verified address as the primary email.
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(User.objects.get(username='researcher').email, 'original@example.com')
        self.assertFalse(EmailAddress.objects.filter(email='changed@example.com', verified=True).exists())

    def test_existing_email_does_not_silently_link_accounts(self):
        existing = User.objects.create_user(username='existing', email='researcher@example.com', password='Cedar-river-754!long')
        EmailAddress.objects.create(user=existing, email=existing.email, verified=True, primary=True)
        self.pending_signup('google', existing.email)
        response = self.post(AUTH + 'provider/signup', {'first_name': 'Research', 'last_name': 'User', 'username': 'researcher', 'email': existing.email})
        self.assertIn(response.status_code, (400, 401), response.content)
        self.assertEqual(User.objects.count(), 1)
        self.assertFalse(SocialAccount.objects.exists())
        self.assertEqual(self.client.get('/api/v1/accounts/me/').status_code, 403)
        queued = OutgoingEmail.objects.get(subject__icontains='Sign in to your existing account')
        self.assertTrue(queued.subject.startswith('[Oja AI]'))
        self.assertIn('Hello from Oja AI!', queued.body)
        self.assertIn(existing.email, queued.body)
        self.assertIn('http://localhost:3000/auth/login?next=connections', queued.body)
        self.assertIn('http://localhost:3000/auth/connections', queued.body)
        self.assertIn('http://localhost:3000/auth/forgot-password', queued.body)
        self.assertIn('No additional account was created', queued.body)
        self.assertNotIn('already exists', response.content.decode().lower())

    def test_forged_callback_does_not_create_session(self):
        response = self.client.get('/accounts/google/login/callback/', {'code': 'forged', 'state': 'wrong-state'})
        self.assertEqual(response.status_code, 302)
        self.assertIn('/auth/provider-callback?error=', response.url)
        self.assertEqual(self.client.get('/api/v1/accounts/me/').status_code, 403)
        self.assertFalse(User.objects.exists())

    def complete_provider_handshake(self, provider='google', process='login'):
        response = self.post(AUTH + 'provider/redirect', {
            'provider': provider, 'process': process, 'callback_url': 'http://localhost:3000/auth/provider-callback',
        }, json=False)
        state = parse_qs(urlparse(response.url).query)['state'][0]
        def login(request, app, token, **kwargs):
            data = {
                'sub': 'google-user-1', 'email': 'researcher@example.com', 'email_verified': True,
            } if provider == 'google' else {'id': 12345, 'login': 'researcher', 'emails': [{'email': 'researcher@example.com', 'primary': True, 'verified': True}]}
            return get_adapter().get_provider(request, provider).sociallogin_from_response(request, data)
        adapter = 'GoogleOAuth2Adapter' if provider == 'google' else 'GitHubOAuth2Adapter'
        with patch('allauth.socialaccount.providers.oauth2.client.OAuth2Client.get_access_token', return_value={'access_token': 'test-token', 'token_type': 'Bearer'}), patch(f'allauth.socialaccount.providers.{provider}.views.{adapter}.complete_login', side_effect=login):
            return self.client.get(f'/accounts/{provider}/login/callback/', {'code': 'test-code', 'state': state})

    def test_full_handshake_signup_and_returning_login(self):
        response = self.complete_provider_handshake()
        self.assertEqual(response.status_code, 302)
        self.assertEqual(response.url, 'http://localhost:3000/auth/provider-callback')
        self.assertFalse(User.objects.exists())
        response = self.post(AUTH + 'provider/signup', {'first_name': 'Research', 'last_name': 'User', 'email': 'researcher@example.com', 'username': 'researcher'})
        self.assertEqual(response.status_code, 200, response.content)
        self.client.logout()
        response = self.complete_provider_handshake()
        self.assertEqual(response.status_code, 302)
        self.assertEqual(self.client.get('/api/v1/accounts/me/').status_code, 200)
        self.assertEqual(User.objects.count(), 1)

    def test_signed_in_user_can_link_provider(self):
        user = User.objects.create_user(username='existing', email='researcher@example.com', password='Cedar-river-754!long')
        EmailAddress.objects.create(user=user, email=user.email, verified=True, primary=True)
        self.assertEqual(self.post(AUTH + 'login', {'email': user.email, 'password': 'Cedar-river-754!long'}).status_code, 200)
        response = self.complete_provider_handshake(process='connect')
        self.assertEqual(response.status_code, 302)
        self.assertNotIn('error=', response.url)
        self.assertTrue(SocialAccount.objects.filter(user=user, provider='google').exists())
        response = self.complete_provider_handshake('github', process='connect')
        self.assertEqual(response.status_code, 302)
        self.assertNotIn('error=', response.url)
        self.assertTrue(SocialAccount.objects.filter(user=user, provider='github').exists())
        self.assertEqual(User.objects.count(), 1)

    def test_github_full_handshake_signup_and_returning_login(self):
        response = self.complete_provider_handshake('github')
        self.assertEqual(response.url, 'http://localhost:3000/auth/provider-callback')
        self.assertFalse(User.objects.exists())
        response = self.post(AUTH + 'provider/signup', {'first_name': 'Research', 'last_name': 'User', 'email': 'researcher@example.com', 'username': 'researcher'})
        self.assertEqual(response.status_code, 200, response.content)
        self.assertTrue(EmailAddress.objects.get(email='researcher@example.com').verified)
        self.client.logout()
        response = self.complete_provider_handshake('github')
        self.assertEqual(response.status_code, 302)
        self.assertEqual(self.client.get('/api/v1/accounts/me/').status_code, 200)
        self.assertEqual(User.objects.count(), 1)
