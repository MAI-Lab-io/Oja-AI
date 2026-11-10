from allauth.account.models import EmailAddress
from django.http import JsonResponse
from django.middleware.csrf import get_token
from django.views.decorators.csrf import ensure_csrf_cookie
from django.views.decorators.http import require_GET
from django.views.decorators.http import require_POST
from django.views.decorators.cache import never_cache
from allauth.account.stages import EmailVerificationStage, LoginStageController
from allauth.account.internal.flows.email_verification import send_verification_email_to_address
from allauth.core import ratelimit
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAdminUser
from rest_framework.response import Response
from .permissions import IsVerifiedContributor


def csrf_failure(request, reason=''):
    return JsonResponse({'detail': 'CSRF verification failed. Refresh the page and try again.'}, status=403)


@require_GET
@never_cache
@ensure_csrf_cookie
def csrf(request):
    return JsonResponse({'csrfToken': get_token(request)})


@require_POST
def resend_verification(request):
    limited = ratelimit.consume_or_429(request, action='resend_verification')
    if limited:
        return JsonResponse({'detail': 'Too many requests. Please try again later.'}, status=429)
    # Scope resends to the account already proven by this signup/login session.
    stage = LoginStageController.enter(request, EmailVerificationStage.key)
    if not stage or not stage.login.user:
        return JsonResponse({'detail': 'Sign in again to request a verification email.'}, status=409)
    address = EmailAddress.objects.filter(
        user=stage.login.user, email__iexact=stage.login.email or stage.login.user.email, verified=False,
    ).first()
    if address:
        sent = send_verification_email_to_address(request, address)
        if not sent:
            return JsonResponse({'detail': 'A verification email was recently requested. Please wait a few minutes.'}, status=429)
    return JsonResponse({'detail': 'Verification instructions requested.'})


@api_view(['GET'])
def me(request):
    user = request.user
    return Response({'user': {
        'id': str(user.pk), 'email': user.email, 'username': user.username,
        'name': user.get_full_name() or user.username, 'is_staff': user.is_staff,
        'email_verified': EmailAddress.objects.filter(user=user, email__iexact=user.email, verified=True).exists(),
    }})


@api_view(['GET'])
@permission_classes([IsVerifiedContributor])
def contribution_access(request):
    return Response({'can_contribute': True})


@api_view(['GET'])
@permission_classes([IsAdminUser])
def admin_access(request):
    return Response({'isAdmin': True})
