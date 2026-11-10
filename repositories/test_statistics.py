from django.core.cache import cache
from django.test import TestCase

from accounts.models import User
from releases.models import Release
from .models import Repository


class PublicStatisticsTests(TestCase):
    def setUp(self):
        cache.clear()
        self.addCleanup(cache.clear)
        self.owner = User.objects.create_user(username='alice', email='alice@example.com')

    def repository(self, name, kind='model', visibility='public', published=1, owner=None):
        repo = Repository.objects.create(owner=owner or self.owner, kind=kind, name=name, slug=name, visibility=visibility)
        for index in range(published):
            Release.objects.create(repository=repo, created_by=repo.owner, version=f'{index + 1}.0', status='published')
        Release.objects.create(repository=repo, created_by=repo.owner, version='next', status='draft')
        return repo

    def test_empty_catalog_returns_real_zeros_without_authentication(self):
        response = self.client.get('/api/v1/statistics/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {'models': 0, 'datasets': 0, 'contributors': 0, 'published_versions': 0})

    def test_counts_public_published_repositories_once_and_owners_distinctly(self):
        bob = User.objects.create_user(username='bob', email='bob@example.com')
        self.repository('model', published=2)
        self.repository('dataset', kind='dataset', published=2)
        self.repository('other-data', kind='dataset', owner=bob)
        response = self.client.get('/api/v1/statistics/')
        self.assertEqual(response.json(), {'models': 1, 'datasets': 2, 'contributors': 2, 'published_versions': 5})

    def test_private_and_unpublished_content_does_not_change_public_statistics(self):
        private_owner = User.objects.create_user(username='private', email='private@example.com')
        self.repository('private', visibility='private', owner=private_owner, published=3)
        self.repository('draft-only', owner=private_owner, published=0)
        self.repository('public')
        anonymous = self.client.get('/api/v1/statistics/').json()
        self.assertEqual(anonymous, {'models': 1, 'datasets': 0, 'contributors': 1, 'published_versions': 1})
        self.client.force_login(private_owner)
        self.assertEqual(self.client.get('/api/v1/statistics/').json(), anonymous)

    def test_aggregates_use_two_queries_and_are_cached(self):
        self.repository('model', published=2)
        with self.assertNumQueries(2):
            response = self.client.get('/api/v1/statistics/')
        self.assertEqual(response.status_code, 200)
        with self.assertNumQueries(0):
            repeated = self.client.get('/api/v1/statistics/')
        self.assertEqual(repeated.json(), response.json())
