from django.urls import include, path
from rest_framework.routers import DefaultRouter
from .api import RepositoryViewSet, ReleaseViewSet, ArtifactViewSet, upload_options
from .statistics import public_statistics

router = DefaultRouter()
router.register('repositories', RepositoryViewSet, basename='repository')
router.register('releases', ReleaseViewSet, basename='release')
router.register('artifacts', ArtifactViewSet, basename='artifact')
urlpatterns = [path('statistics/', public_statistics), path('upload-options/', upload_options), path('', include(router.urls))]
