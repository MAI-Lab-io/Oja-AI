"""Small, anonymous aggregates for the public home page."""
from django.core.cache import cache
from django.db.models import Count, Exists, OuterRef, Q
from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from releases.models import Release
from .models import Repository


@api_view(['GET'])
@authentication_classes([])
@permission_classes([AllowAny])
def public_statistics(request):
    key = 'public-platform-statistics-v1'
    data = cache.get(key)
    if data is None:
        published = Release.objects.filter(status='published', repository_id=OuterRef('pk'))
        repositories = Repository.objects.filter(visibility='public').filter(Exists(published))
        data = repositories.aggregate(
            models=Count('pk', filter=Q(kind=Repository.Kind.MODEL)),
            datasets=Count('pk', filter=Q(kind=Repository.Kind.DATASET)),
            contributors=Count('owner_id', distinct=True),
        )
        data['published_versions'] = Release.objects.filter(status='published', repository__visibility='public').count()
        cache.set(key, data, timeout=30)
    response = Response(data)
    # Only cache the aggregate server-side, never a browser's account response.
    response['Cache-Control'] = 'no-store'
    return response
