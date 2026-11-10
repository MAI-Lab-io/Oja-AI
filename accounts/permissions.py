from allauth.account.models import EmailAddress
from rest_framework.permissions import BasePermission


class IsVerifiedContributor(BasePermission):
    message = 'Verify your email before contributing.'

    def has_permission(self, request, view):
        return bool(
            request.user.is_authenticated and request.user.is_active
            and EmailAddress.objects.filter(user=request.user, email__iexact=request.user.email, verified=True).exists()
        )
