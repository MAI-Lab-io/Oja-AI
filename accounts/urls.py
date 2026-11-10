from django.urls import path
from . import views

urlpatterns = [
    path('csrf/', views.csrf, name='accounts-csrf'),
    path('resend-verification/', views.resend_verification, name='accounts-resend-verification'),
    path('me/', views.me, name='accounts-me'),
    path('contribution-access/', views.contribution_access, name='contribution-access'),
    path('admin-access/', views.admin_access, name='admin-access'),
]
 