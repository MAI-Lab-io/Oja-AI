"""Environment-driven settings for the Django API."""
from pathlib import Path
import environ
from django.core.exceptions import ImproperlyConfigured

BASE_DIR = Path(__file__).resolve().parent.parent
env = environ.Env()
environ.Env.read_env(BASE_DIR / '.env.django')
DEBUG = env.bool('DJANGO_DEBUG', default=False)
SECRET_KEY = env('DJANGO_SECRET_KEY', default='development-only-change-before-deployment-1234567890')
ALLOWED_HOSTS = env.list('DJANGO_ALLOWED_HOSTS', default=['localhost', '127.0.0.1', 'testserver'])
FRONTEND_URL = env('FRONTEND_URL', default='http://localhost:3000').rstrip('/')
PLATFORM_NAME = env('PLATFORM_NAME', default='Oja AI')
CSRF_TRUSTED_ORIGINS = env.list('CSRF_TRUSTED_ORIGINS', default=['http://localhost:3000'])
INSTALLED_APPS = [
    'django.contrib.admin', 'django.contrib.auth', 'django.contrib.contenttypes',
    'django.contrib.sessions', 'django.contrib.messages', 'django.contrib.staticfiles',
    'rest_framework', 'allauth', 'allauth.account', 'allauth.headless',
    'allauth.socialaccount', 'allauth.socialaccount.providers.google', 'allauth.socialaccount.providers.github',
    'accounts',
    'repositories', 'releases', 'artifacts', 'datasets', 'models_catalog',
]
MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'whitenoise.middleware.WhiteNoiseMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'allauth.account.middleware.AccountMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]
ROOT_URLCONF = 'Oja_AI.urls'
TEMPLATES = [{
    'BACKEND': 'django.template.backends.django.DjangoTemplates', 'DIRS': [BASE_DIR / 'templates'], 'APP_DIRS': True,
    'OPTIONS': {'context_processors': [
        'django.template.context_processors.request', 'django.contrib.auth.context_processors.auth',
        'django.contrib.messages.context_processors.messages',
    ]},
}]
WSGI_APPLICATION = 'Oja_AI.wsgi.application'
DATABASES = {'default': env.db('DATABASE_URL', default='postgresql://oja:oja@127.0.0.1:5432/oja_ai')}
if DATABASES['default']['ENGINE'] != 'django.db.backends.postgresql':
    raise ImproperlyConfigured('DATABASE_URL must use PostgreSQL.')
DATABASES['default'].update(
    CONN_MAX_AGE=env.int('DB_CONN_MAX_AGE', default=60), CONN_HEALTH_CHECKS=True,
    DISABLE_SERVER_SIDE_CURSORS=True, OPTIONS={'connect_timeout': 5},
)
AUTH_USER_MODEL = 'accounts.User'
AUTHENTICATION_BACKENDS = [
    'django.contrib.auth.backends.ModelBackend', 'allauth.account.auth_backends.AuthenticationBackend',
]
PASSWORD_HASHERS = [
    'django.contrib.auth.hashers.Argon2PasswordHasher', 'django.contrib.auth.hashers.PBKDF2PasswordHasher',
]
AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'},
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator', 'OPTIONS': {'min_length': 12}},
    {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'},
]
PASSWORD_RESET_TIMEOUT = 3600
ACCOUNT_LOGIN_METHODS = {'email'}
ACCOUNT_SIGNUP_FIELDS = ['email*', 'username*', 'password1*', 'password2*']
ACCOUNT_EMAIL_VERIFICATION = 'mandatory'
ACCOUNT_EMAIL_CONFIRMATION_EXPIRE_DAYS = 1
ACCOUNT_LOGIN_ON_EMAIL_CONFIRMATION = False
ACCOUNT_LOGIN_ON_PASSWORD_RESET = False
ACCOUNT_LOGOUT_ON_PASSWORD_CHANGE = True
ACCOUNT_PREVENT_ENUMERATION = True
ACCOUNT_EMAIL_NOTIFICATIONS = True
ACCOUNT_EMAIL_SUBJECT_PREFIX = f'[{PLATFORM_NAME}] '
ACCOUNT_RATE_LIMITS = {'resend_verification': '10/m/ip'}
ACCOUNT_ADAPTER = 'accounts.adapters.AccountAdapter'
ACCOUNT_SIGNUP_FORM_CLASS = 'accounts.forms.SignupProfileForm'
# Require a public username and email on first provider signup, without a password.
SOCIALACCOUNT_AUTO_SIGNUP = False
SOCIALACCOUNT_ADAPTER = 'accounts.adapters.SocialAccountAdapter'
SOCIALACCOUNT_EMAIL_REQUIRED = True
SOCIALACCOUNT_EMAIL_VERIFICATION = 'mandatory'
SOCIALACCOUNT_EMAIL_AUTHENTICATION = False
SOCIALACCOUNT_EMAIL_AUTHENTICATION_AUTO_CONNECT = False
SOCIALACCOUNT_STORE_TOKENS = False
SOCIALACCOUNT_LOGIN_ON_GET = False
SOCIALACCOUNT_PROVIDERS = {
    'google': {'SCOPE': ['profile', 'email'], 'OAUTH_PKCE_ENABLED': True},
    'github': {'SCOPE': ['user:email'], 'OAUTH_PKCE_ENABLED': True},
}
for provider_id in ('google', 'github'):
    client_id = env(provider_id.upper() + '_CLIENT_ID', default='')
    client_secret = env(provider_id.upper() + '_CLIENT_SECRET', default='')
    if bool(client_id) != bool(client_secret):
        raise ImproperlyConfigured(f'{provider_id}: configure both CLIENT_ID and CLIENT_SECRET.')
    if client_id and client_secret:
        SOCIALACCOUNT_PROVIDERS[provider_id]['APP'] = {'client_id': client_id, 'secret': client_secret, 'key': ''}
HEADLESS_ONLY = True
HEADLESS_ADAPTER = 'accounts.adapters.HeadlessAdapter'
HEADLESS_CLIENTS = ('browser',)
HEADLESS_SERVE_SPECIFICATION = DEBUG
HEADLESS_FRONTEND_URLS = {
    'account_confirm_email': FRONTEND_URL + '/auth/verify-email?key={key}',
    'account_reset_password_from_key': FRONTEND_URL + '/auth/reset-password?key={key}',
    'account_signup': FRONTEND_URL + '/auth/signup',
    'account_reset_password': FRONTEND_URL + '/auth/forgot-password',
    'account_login': FRONTEND_URL + '/auth/login',
    'socialaccount_login_error': FRONTEND_URL + '/auth/provider-callback',
}
LOGIN_REDIRECT_URL = FRONTEND_URL + '/model-zoo'
REDIS_URL = env('REDIS_URL', default='')
CACHES = {'default': (
    {'BACKEND': 'django.core.cache.backends.redis.RedisCache', 'LOCATION': REDIS_URL, 'KEY_PREFIX': 'oja'}
    if REDIS_URL else {'BACKEND': 'django.core.cache.backends.locmem.LocMemCache', 'LOCATION': 'oja-dev'}
)}
REST_FRAMEWORK = {
    'DEFAULT_PARSER_CLASSES': ['repositories.parsers.BoundedJSONParser'],
    'DEFAULT_AUTHENTICATION_CLASSES': ['rest_framework.authentication.SessionAuthentication'],
    'DEFAULT_PERMISSION_CLASSES': ['rest_framework.permissions.IsAuthenticated'],
    'DEFAULT_RENDERER_CLASSES': ['rest_framework.renderers.JSONRenderer'],
}
SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_SAMESITE = 'Lax'
SESSION_COOKIE_SECURE = not DEBUG
SESSION_COOKIE_AGE = 60 * 60 * 24 * 7
CSRF_COOKIE_SECURE = not DEBUG
CSRF_COOKIE_SAMESITE = 'Lax'
CSRF_FAILURE_VIEW = 'accounts.views.csrf_failure'
SECURE_SSL_REDIRECT = not DEBUG
SECURE_HSTS_SECONDS = 0 if DEBUG else 31536000
SECURE_HSTS_INCLUDE_SUBDOMAINS = not DEBUG
SECURE_CONTENT_TYPE_NOSNIFF = True
X_FRAME_OPTIONS = 'DENY'
if not DEBUG and (SECRET_KEY.startswith('development-only') or not REDIS_URL or not FRONTEND_URL.startswith('https://')):
    raise ImproperlyConfigured('Production requires a secret key, REDIS_URL, and HTTPS FRONTEND_URL.')
LANGUAGE_CODE = 'en-us'
TIME_ZONE = 'UTC'
USE_I18N = True
USE_TZ = True
STATIC_URL = '/static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'
DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'
UPLOAD_MAX_FILE_BYTES = env.int('UPLOAD_MAX_FILE_BYTES', default=1024 * 1024 * 1024)
UPLOAD_USER_QUOTA_BYTES = env.int('UPLOAD_USER_QUOTA_BYTES', default=10 * 1024 * 1024 * 1024)
UPLOAD_MAX_FILES = 100
ARTIFACT_STORAGE_ROOT = env('ARTIFACT_STORAGE_ROOT', default='')
if not DEBUG and not ARTIFACT_STORAGE_ROOT:
    raise ImproperlyConfigured('Production requires an explicit persistent ARTIFACT_STORAGE_ROOT.')
UPLOAD_SCAN_MODE = env('UPLOAD_SCAN_MODE', default='development' if DEBUG else 'clamav')
if UPLOAD_SCAN_MODE not in {'development', 'clamav'} or (not DEBUG and UPLOAD_SCAN_MODE != 'clamav'):
    raise ImproperlyConfigured('Production upload validation requires UPLOAD_SCAN_MODE=clamav.')
CLAMAV_HOST = env('CLAMAV_HOST', default='127.0.0.1')
CLAMAV_PORT = env.int('CLAMAV_PORT', default=3310)
FILE_UPLOAD_MAX_MEMORY_SIZE = 0
DATA_UPLOAD_MAX_MEMORY_SIZE = 2 * 1024 * 1024
DATA_UPLOAD_MAX_NUMBER_FILES = 1
FILE_UPLOAD_HANDLERS = [
    'artifacts.upload_handlers.BoundedUploadHandler',
    'django.core.files.uploadhandler.TemporaryFileUploadHandler',
]
STORAGES = {
    'default': {'BACKEND': 'django.core.files.storage.FileSystemStorage'},
    'staticfiles': {'BACKEND': 'django.contrib.staticfiles.storage.StaticFilesStorage'},
    'artifacts': {
        'BACKEND': 'artifacts.backends.PrivateArtifactStorage',
        'OPTIONS': {'location': ARTIFACT_STORAGE_ROOT or BASE_DIR / '.local' / 'artifacts', 'file_permissions_mode': 0o600, 'directory_permissions_mode': 0o700},
    },
}
DEFAULT_FROM_EMAIL = env('DEFAULT_FROM_EMAIL', default='Oja AI <noreply@localhost>')
MAILERS = {'default': {
    'BACKEND': env('EMAIL_BACKEND', default='accounts.mail_backends.ReadableConsoleEmailBackend'),
    'OPTIONS': {
        'host': env('EMAIL_HOST', default='localhost'), 'port': env.int('EMAIL_PORT', default=587),
        'username': env('EMAIL_HOST_USER', default=''), 'password': env('EMAIL_HOST_PASSWORD', default=''),
        'use_tls': env.bool('EMAIL_USE_TLS', default=True), 'timeout': 15,
    } if env('EMAIL_BACKEND', default='').endswith('smtp.EmailBackend') else {},
}}
