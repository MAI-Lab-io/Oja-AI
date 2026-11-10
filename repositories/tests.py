from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
import hashlib
from io import BytesIO, StringIO
import json
from pathlib import Path
import tempfile
from threading import Barrier
from unittest.mock import MagicMock, patch
import zipfile

from allauth.account.models import EmailAddress
from django.conf import settings
from django.core.cache import cache
from django.core.exceptions import ImproperlyConfigured
from django.core.files.base import ContentFile
from django.core.management import call_command
from django.db import close_old_connections, connections
from django.test import Client, TestCase, TransactionTestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import User
from artifacts.models import Artifact, ArtifactDeletion
from artifacts.processing import process_one, cleanup_expired, cleanup_deleted
from artifacts.storage import storage
from artifacts.validation import inspect_format, malware_scan
from releases.models import Release, ReleaseEvent
from .models import Repository


def metadata(kind='dataset'):
    common = {'license': 'CC-BY-4.0', 'task': 'classification', 'intended_use': 'Research', 'limitations': 'Small sample; evaluate bias.'}
    return {**common, **({'modality': 'tabular', 'collection_method': 'Synthetic samples', 'contains_personal_data': 'no', 'splits': {}, 'features': []} if kind == 'dataset' else {'framework': 'pytorch', 'architecture': 'Linear classifier', 'training_description': 'Trained on synthetic data'})}


@override_settings(DEBUG=True, UPLOAD_SCAN_MODE='development', ARTIFACT_STORAGE_ROOT='')
class UploadFlowTests(TestCase):
    def setUp(self):
        cache.clear()
        self.directory = tempfile.TemporaryDirectory()
        self.storage_override = override_settings(STORAGES={**settings.STORAGES, 'artifacts': {'BACKEND': 'artifacts.backends.PrivateArtifactStorage', 'OPTIONS': {'location': self.directory.name}}})
        self.storage_override.enable()
        self.addCleanup(self.storage_override.disable)
        self.addCleanup(self.directory.cleanup)
        self.user = User.objects.create_user(username='alice', email='alice@example.com', password='Long-testing-password-892!')
        self.other = User.objects.create_user(username='bob', email='bob@example.com', password='Long-testing-password-892!')
        for user in [self.user, self.other]:
            EmailAddress.objects.create(user=user, email=user.email, verified=True, primary=True)
        self.client = Client(enforce_csrf_checks=True)
        self.client.force_login(self.user)

    def write(self, path, data=None, method='post', client=None):
        client = client or self.client
        token = client.get('/api/v1/accounts/csrf/').json()['csrfToken']
        return getattr(client, method)(path, data or {}, content_type='application/json', HTTP_X_CSRFTOKEN=token)

    def create(self, kind='dataset', visibility='private', slug='samples'):
        response = self.write('/api/v1/repositories/', {'kind': kind, 'name': 'Samples', 'slug': slug, 'description': 'Synthetic samples for testing.', 'visibility': visibility})
        self.assertEqual(response.status_code, 201, response.content)
        repository = response.json()
        response = self.write(f"/api/v1/repositories/{repository['id']}/releases/", {'version': '1.0.0', 'metadata': metadata(kind), 'card': '# Artifact card\nSources and limitations.', 'changelog': 'Initial release', 'rights_confirmed': True})
        self.assertEqual(response.status_code, 201, response.content)
        return repository, response.json()

    def reserve(self, release, path='data.csv', content=b'text,label\nhello,1\n', checksum=None):
        data = {'path': path, 'size': len(content)}
        if checksum is not None:
            data['sha256'] = checksum
        response = self.write(f"/api/v1/releases/{release['id']}/files/", data)
        self.assertEqual(response.status_code, 201, response.content)
        return response.json()

    def upload(self, reservation, content=b'text,label\nhello,1\n'):
        token = self.client.get('/api/v1/accounts/csrf/').json()['csrfToken']
        response = self.client.put(reservation['upload_url'], content, content_type='application/octet-stream', HTTP_X_CSRFTOKEN=token)
        self.assertEqual(response.status_code, 202, response.content)
        return Artifact.objects.get(pk=reservation['file']['id'])

    def publish(self, release):
        return self.write(f"/api/v1/releases/{release['id']}/publish/")

    def ready_release(self, release, kind='dataset'):
        content = b'text,label\nhello,1\n' if kind == 'dataset' else b'opaque model weight fixture'
        item = self.upload(self.reserve(release, 'data.csv' if kind == 'dataset' else 'model.pt', content), content)
        self.assertTrue(process_one())
        response = self.publish(release)
        self.assertEqual(response.status_code, 200, response.content)
        return item

    def test_public_named_lookup_and_exact_version_keep_visibility_and_namespaces(self):
        for kind in ['model', 'dataset']:
            repo = Repository.objects.create(owner=self.user, kind=kind, name='Shared', slug=kind + '-shared', visibility='public')
            release = Release.objects.create(repository=repo, created_by=self.user, version='1.0.0', status='published', published_at=timezone.now())
            other = Repository.objects.create(owner=self.other, kind=kind, name='Other owner', slug=repo.slug, visibility='public')
            Release.objects.create(repository=other, created_by=self.other, version='1.0.0', status='published')
            endpoint = f'/api/v1/repositories/?scope=public&kind={kind}&owner=alice&slug={repo.slug.upper()}'
            result = Client().get(endpoint).json()
            self.assertEqual([item['id'] for item in result['results']], [str(repo.pk)])
            self.assertEqual(Client().get(endpoint.replace('owner=alice', 'owner=unknown')).json()['count'], 0)
            Release.objects.bulk_create([Release(repository=repo, created_by=self.user, version=f'draft-{i}') for i in range(101)])
            version_url = f'/api/v1/repositories/{repo.pk}/releases/?version=1.0.0'
            self.assertEqual([item['id'] for item in self.client.get(version_url).json()], [str(release.pk)])
            self.assertEqual(Client().get(version_url.replace('1.0.0', 'draft-1')).json(), [])
            self.assertEqual(Client().get(version_url.replace('1.0.0', 'unknown')).json(), [])
            repo.visibility = 'private'
            repo.save(update_fields=['visibility'])
            self.assertEqual(self.client.get(endpoint).json()['count'], 0)
            self.assertEqual(Client().get(version_url).status_code, 404)

    def test_citation_is_optional_contributor_metadata_for_models_and_datasets(self):
        for kind in ['model', 'dataset']:
            _, release = self.create(kind, slug='citation-' + kind)
            for citation in ['', 'Contributor reference, version 1.0. DOI: example only.']:
                response = self.write(f"/api/v1/releases/{release['id']}/", {'metadata': {**metadata(kind), 'citation': citation}}, method='patch')
                self.assertEqual(response.status_code, 200, response.content)
                self.assertEqual(response.json()['metadata']['citation'], citation)

    def test_catalog_ordering_uses_names_completed_downloads_and_latest_publication_before_pagination(self):
        for kind in ['model', 'dataset']:
            for index, (name, count, published_day) in enumerate([('Zeta', 9, 1), ('alpha', 2, 2), ('Beta', 4, 3)]):
                repo = Repository.objects.create(owner=self.user, kind=kind, name=name, slug=f'{kind}-sort-{index}', description='Sorting fixture', visibility='public', download_count=count)
                Release.objects.create(repository=repo, created_by=self.user, version='1', status='published', published_at=timezone.now() - timedelta(days=published_day))
                # Repository creation and newest draft timestamps must not decide release order.
                Release.objects.create(repository=repo, created_by=self.user, version='next', status='draft')
            endpoint = f'/api/v1/repositories/?kind={kind}&scope=public&limit=2'
            for ordering, expected in [('name', ['alpha', 'Beta', 'Zeta']), ('downloads', ['Zeta', 'Beta', 'alpha']), ('newest', ['Zeta', 'alpha', 'Beta'])]:
                first = Client().get(endpoint + '&ordering=' + ordering).json()
                second = Client().get(endpoint + '&ordering=' + ordering + '&offset=2').json()
                self.assertEqual([item['name'] for item in first['results'] + second['results']], expected)

    def test_anonymous_downloads_include_files_and_manifest_and_increment_real_counts(self):
        anonymous = Client()
        for kind in ['model', 'dataset']:
            with self.subTest(kind=kind):
                repository, release = self.create(kind, 'public', slug=f'download-{kind}')
                item = self.ready_release(release, kind)
                endpoint = f"/api/v1/releases/{release['id']}/download/"
                archive_head = anonymous.head(endpoint)
                self.assertEqual(archive_head.status_code, 200)
                self.assertEqual(b''.join(archive_head.streaming_content), b'')
                self.assertEqual(Repository.objects.get(pk=repository['id']).download_count, 0)
                response = anonymous.get(endpoint)
                self.assertEqual(response.status_code, 200, response)
                self.assertEqual(Repository.objects.get(pk=repository['id']).download_count, 0)
                self.assertEqual(response['Content-Type'], 'application/zip')
                self.assertIn('attachment', response['Content-Disposition'])
                with zipfile.ZipFile(BytesIO(b''.join(response.streaming_content))) as archive:
                    self.assertIn('manifest.json', archive.namelist())
                    self.assertIn('files/' + item.path, archive.namelist())
                    with storage().open(item.storage_key) as original:
                        self.assertEqual(archive.read('files/' + item.path), original.read())
                    manifest = json.loads(archive.read('manifest.json'))
                    self.assertEqual(manifest['release_id'], release['id'])
                file_url = f'/api/v1/artifacts/{item.pk}/download/'
                file_head = anonymous.head(file_url)
                self.assertEqual(file_head.status_code, 200)
                self.assertEqual(b''.join(file_head.streaming_content), b'')
                download = anonymous.get(file_url)
                self.assertEqual(Repository.objects.get(pk=repository['id']).download_count, 1)
                self.assertIsNone(download.file_to_stream)
                self.assertTrue(b''.join(download.streaming_content))
                self.assertEqual(Repository.objects.get(pk=repository['id']).download_count, 2)
                response = anonymous.get(f"/api/v1/repositories/{repository['id']}/")
                self.assertEqual(response.json()['download_count'], 2)
                self.write(f"/api/v1/repositories/{repository['id']}/", {'download_count': 99999}, method='patch')
                self.assertEqual(Repository.objects.get(pk=repository['id']).download_count, 2)

    def test_interrupted_file_and_archive_streams_do_not_increment_download_count(self):
        repository, release = self.create(visibility='public', slug='interrupted-download')
        item = self.ready_release(release)
        anonymous = Client()
        for url in [f"/api/v1/releases/{release['id']}/download/", f'/api/v1/artifacts/{item.pk}/download/']:
            response = anonymous.get(url)
            self.assertEqual(Repository.objects.get(pk=repository['id']).download_count, 0)
            chunks = iter(response.streaming_content)
            self.assertTrue(next(chunks))
            # Simulate WSGI closing the response when the client disconnects.
            # Django's test-client wrapper handles its request-finished signal.
            response._iterator.close()
            self.assertEqual(Repository.objects.get(pk=repository['id']).download_count, 0)
        row = Repository.objects.get(pk=repository['id'])
        self.assertEqual(row.download_request_count, 2)

    def test_late_archive_storage_failure_does_not_count_a_completed_download(self):
        repository, release = self.create(visibility='public', slug='failed-stream')
        self.ready_release(release)
        response = Client().get(f"/api/v1/releases/{release['id']}/download/")
        with patch.object(storage(), 'open', side_effect=OSError('Storage failed during streaming')):
            with self.assertRaises(OSError):
                b''.join(response.streaming_content)
        self.assertEqual(Repository.objects.get(pk=repository['id']).download_count, 0)

    def test_downloads_preserve_private_and_draft_access_rules_and_do_not_count_failures(self):
        repository, release = self.create(slug='private-download')
        item = self.ready_release(release)
        anonymous = Client()
        endpoint = f"/api/v1/releases/{release['id']}/download/"
        self.assertEqual(anonymous.get(endpoint).status_code, 404)
        self.assertEqual(anonymous.get(f'/api/v1/artifacts/{item.pk}/download/').status_code, 404)
        with patch.object(storage(), 'open', side_effect=OSError('Unavailable')):
            self.assertEqual(self.client.get(endpoint).status_code, 503)
            self.assertEqual(self.client.get(f'/api/v1/artifacts/{item.pk}/download/').status_code, 503)
        self.assertEqual(Repository.objects.get(pk=repository['id']).download_count, 0)
        _, draft = self.create(visibility='public', slug='draft-download')
        self.assertEqual(anonymous.get(f"/api/v1/releases/{draft['id']}/download/").status_code, 404)
        self.assertEqual(self.client.get(f"/api/v1/releases/{draft['id']}/download/").status_code, 409)

    def save_splits(self, release, splits, features=None):
        return self.write(f"/api/v1/releases/{release['id']}/", {'metadata': {**metadata(), 'splits': splits, 'features': features or []}}, method='patch')

    def test_separate_dataset_files_resolve_paths_to_exact_artifact_ids_and_publish(self):
        for partitions in [['train', 'validation', 'test'], ['train', 'test']]:
            repository, release = self.create(visibility='public', slug='parts-' + str(len(partitions)))
            uploaded = {}
            for partition in partitions:
                item = self.upload(self.reserve(release, f'{partition}.csv'))
                self.assertTrue(process_one())
                uploaded[partition] = str(item.pk)
            response = self.save_splits(release, {'status': 'predefined', 'method': 'separate_files', 'files': {name: f'{name}.csv' for name in partitions}, 'ratios': None}, [{'name': 'text', 'dtype': 'string'}])
            self.assertEqual(response.status_code, 200, response.content)
            self.assertEqual(response.json()['metadata']['splits']['files'], uploaded)
            self.assertEqual(self.publish(release).status_code, 200)
            manifest = Client().get(f"/api/v1/releases/{release['id']}/manifest/").json()['manifest']
            self.assertEqual(manifest['metadata']['splits']['files'], uploaded)
            self.assertEqual(manifest['metadata']['features'], [{'name': 'text', 'dtype': 'string'}])

    def test_split_column_is_checked_in_actual_csv_tsv_json_jsonl_and_parquet_files(self):
        import pyarrow as pa
        import pyarrow.parquet as pq
        parquet = BytesIO()
        pq.write_table(pa.table({'age': [20, 30], 'split': ['Train', 'Test']}), parquet)
        samples = {
            'csv': b'age,split\n20,Train\n30,Test\n',
            'tsv': b'age\tsplit\n20\tTrain\n30\tTest\n',
            'json': b'[{"age":20,"split":"Train"},{"age":30,"split":"Test"}]',
            'jsonl': b'{"age":20,"split":"Train"}\n{"age":30,"split":"Test"}\n',
            'parquet': parquet.getvalue(),
        }
        for ext, content in samples.items():
            with self.subTest(format=ext):
                _, release = self.create(slug='column-' + ext)
                item = self.upload(self.reserve(release, f'records.{ext}', content), content)
                self.assertTrue(process_one())
                config = {'status': 'predefined', 'method': 'column', 'column': 'split', 'values': {'train': 'Train', 'test': 'Test'}, 'ratios': None}
                response = self.save_splits(release, config, [{'name': 'age', 'dtype': 'integer'}])
                self.assertEqual(response.status_code, 200, response.content)
                self.assertEqual(response.json()['metadata']['splits']['file'], str(item.pk))
                self.assertEqual(self.publish(release).status_code, 200)

    def test_column_and_separate_file_references_reject_missing_or_other_release_files(self):
        _, release = self.create(slug='column-check')
        data = b'age,partition\n20,Train\n'
        item = self.upload(self.reserve(release, 'records.csv', data), data)
        config = {'status': 'predefined', 'method': 'column', 'file': str(item.pk), 'column': 'split', 'values': {'train': 'Train'}}
        self.assertEqual(self.save_splits(release, config).status_code, 400)  # Not ready.
        self.assertTrue(process_one())
        response = self.save_splits(release, config, [{'name': 'split', 'dtype': 'string'}])
        self.assertEqual(response.status_code, 400)  # A feature declaration is not proof.
        config['column'] = 'partition'
        self.assertEqual(self.save_splits(release, config).status_code, 200)
        _, other = self.create(slug='other-column')
        self.assertEqual(self.save_splits(other, config).status_code, 400)
        self.assertEqual(self.save_splits(other, {'status': 'predefined', 'method': 'separate_files', 'files': {'train': str(item.pk)}}).status_code, 400)
        self.assertEqual(self.save_splits(release, {'status': 'predefined', 'method': 'separate_files', 'files': {'train': 'missing.csv'}}).status_code, 400)
        self.assertEqual(self.write(f'/api/v1/artifacts/{item.pk}/', method='delete').status_code, 204)
        self.assertEqual(self.publish(release).status_code, 400)  # Recheck stale references.

    def test_ambiguous_column_data_file_requires_an_explicit_reference(self):
        _, release = self.create(slug='ambiguous')
        content = b'age,split\n20,Train\n'
        for name in ['one.csv', 'two.csv']:
            item = self.upload(self.reserve(release, name, content), content)
            self.assertTrue(process_one())
        config = {'status': 'predefined', 'method': 'column', 'column': 'split', 'values': {'train': 'Train'}}
        self.assertEqual(self.save_splits(release, config).status_code, 400)
        self.assertEqual(self.save_splits(release, {**config, 'file': str(item.pk)}).status_code, 200)

    def test_user_defined_splits_can_be_configured_later_and_support_80_20(self):
        _, release = self.create(slug='unsplit')
        config = {'status': 'not_provided', 'method': 'user_defined', 'column': None, 'values': None, 'ratios': None}
        self.assertEqual(self.save_splits(release, config).status_code, 200)
        for ratios in [{'train': 70, 'validation': 15, 'test': 15}, {'train': 80, 'test': 20}]:
            response = self.save_splits(release, {**config, 'ratios': ratios})
            self.assertEqual(response.status_code, 200, response.content)
        response = self.save_splits(release, {**config, 'ratios': {'train': 80, 'test': 10}})
        self.assertEqual(response.status_code, 400)
        row = Release.objects.get(pk=release['id'])
        self.assertEqual(row.metadata['splits']['ratios'], {'train': 80, 'test': 20})
        self.ready_release(release)

    def test_legacy_dataset_splits_are_returned_unchanged_in_release_and_public_listing(self):
        _, release = self.create(visibility='public', slug='legacy-splits')
        legacy = {'train': 70, 'validation': 15, 'test': 15}
        self.assertEqual(self.save_splits(release, legacy).status_code, 200)
        self.ready_release(release)
        anonymous = Client()
        self.assertEqual(anonymous.get(f"/api/v1/releases/{release['id']}/").json()['metadata']['splits'], legacy)
        listing = anonymous.get('/api/v1/repositories/?kind=dataset&scope=public').json()
        self.assertEqual(listing['results'][0]['latest_release']['metadata']['splits'], legacy)

    def test_upload_required_fields_are_enforced_and_explicit_optional_fields_allow_blanks(self):
        for kind in ['model', 'dataset']:
            for description in [None, '', '   ']:
                data = {'kind': kind, 'name': 'Required', 'slug': 'required'}
                if description is not None:
                    data['description'] = description
                response = self.write('/api/v1/repositories/', data)
                self.assertEqual(response.status_code, 400, response.content)
                self.assertIn('description', response.json())
            _, release = self.create(kind, slug=f'required-{kind}')
            url = f"/api/v1/releases/{release['id']}/"
            required = ['license', 'task', 'intended_use', 'limitations'] + (['framework', 'architecture', 'training_description'] if kind == 'model' else ['modality', 'collection_method', 'contains_personal_data', 'splits', 'features'])
            for field in required:
                value = metadata(kind)
                value.pop(field)
                response = self.write(url, {'metadata': value}, method='patch')
                self.assertEqual(response.status_code, 400, (kind, field, response.content))
            for field, value in [('card', ''), ('card', '   '), ('changelog', ''), ('rights_confirmed', False)]:
                response = self.write(url, {field: value}, method='patch')
                self.assertEqual(response.status_code, 400, (field, response.content))
            optional = {**metadata(kind), 'source_url': '', 'code_url': '', 'code_revision': '', 'methods': ''}
            response = self.write(url, {'metadata': optional, 'sources': []}, method='patch')
            self.assertEqual(response.status_code, 200, response.content)

    def test_delete_model_and_dataset_repositories_with_internal_versions_and_files(self):
        anonymous = Client()
        other = Client()
        other.force_login(self.other)
        for kind in ['model', 'dataset']:
            with self.subTest(kind=kind):
                repository, first = self.create(kind, 'public', slug=f'delete-{kind}')
                first_file = self.ready_release(first, kind)
                second = self.write(f"/api/v1/repositories/{repository['id']}/releases/", {
                    'version': '2', 'parent': first['id'], 'sources': [{'source': first['id'], 'relation': 'derived_from'}],
                    'metadata': metadata(kind), 'card': '# Second version', 'changelog': 'Updated', 'rights_confirmed': True,
                })
                self.assertEqual(second.status_code, 201, second.content)
                second_file = self.ready_release(second.json(), kind)
                url = f"/api/v1/repositories/{repository['id']}/"
                confirmation = {'confirmation': f"alice/{repository['slug']}"}
                self.assertIn(anonymous.delete(url).status_code, [401, 403])
                self.assertEqual(self.write(url, confirmation, method='delete', client=other).status_code, 403)
                self.assertEqual(self.write(url, {}, method='delete').status_code, 400)
                cache.clear()  # Publication statistics are normally cached for 30 seconds.
                self.assertEqual(anonymous.get('/api/v1/statistics/').json()[kind + 's'], 1)
                with self.captureOnCommitCallbacks(execute=True):
                    response = self.write(url, confirmation, method='delete')
                self.assertEqual(response.status_code, 204, response.content)
                self.assertFalse(Repository.objects.filter(pk=repository['id']).exists())
                self.assertFalse(Release.objects.filter(repository_id=repository['id']).exists())
                self.assertFalse(Artifact.objects.filter(pk__in=[first_file.pk, second_file.pk]).exists())
                self.assertFalse(ReleaseEvent.objects.filter(release_id=first['id']).exists())
                self.assertEqual(ArtifactDeletion.objects.count(), 2)
                for item in [first_file, second_file]:
                    self.assertTrue(storage().exists(item.storage_key))
                    self.assertEqual(anonymous.get(f'/api/v1/artifacts/{item.pk}/download/').status_code, 404)
                self.assertEqual(anonymous.get('/api/v1/statistics/').json()[kind + 's'], 0)
                cleanup_expired()
                self.assertEqual(ArtifactDeletion.objects.count(), 0)
                for item in [first_file, second_file]:
                    self.assertFalse(storage().exists(item.storage_key))

    def test_deletion_preserves_external_provenance_and_active_uploads(self):
        source, source_release = self.create(slug='source')
        self.ready_release(source_release)
        _, derived = self.create(slug='derived')
        self.assertEqual(self.write(f"/api/v1/releases/{derived['id']}/", {'sources': [{'source': source_release['id'], 'relation': 'derived_from'}]}, method='patch').status_code, 200)
        url = f"/api/v1/repositories/{source['id']}/"
        response = self.write(url, {'confirmation': 'alice/source'}, method='delete')
        self.assertEqual(response.status_code, 409)
        self.assertTrue(Repository.objects.filter(pk=source['id']).exists())
        self.assertFalse(ArtifactDeletion.objects.exists())
        active, release = self.create(slug='active')
        item = self.upload(self.reserve(release))
        for state in ['receiving', 'validating']:
            Artifact.objects.filter(pk=item.pk).update(status=state)
            response = self.write(f"/api/v1/repositories/{active['id']}/", {'confirmation': 'alice/active'}, method='delete')
            self.assertEqual(response.status_code, 409)
            self.assertTrue(Artifact.objects.filter(pk=item.pk).exists())
        self.assertFalse(ArtifactDeletion.objects.exists())

    def test_storage_cleanup_is_retried_and_pending_deletions_still_count_toward_quota(self):
        repository, release = self.create(slug='cleanup')
        item = self.ready_release(release)
        self.assertEqual(self.write(f"/api/v1/repositories/{repository['id']}/", {'confirmation': 'alice/cleanup'}, method='delete').status_code, 204)
        with patch.object(storage(), 'delete', side_effect=OSError('Storage unavailable')):
            cleanup_deleted()
        self.assertEqual(ArtifactDeletion.objects.count(), 1)
        self.assertTrue(storage().exists(item.storage_key))
        _, another = self.create(slug='replacement')
        with override_settings(UPLOAD_USER_QUOTA_BYTES=item.declared_size):
            response = self.write(f"/api/v1/releases/{another['id']}/files/", {'path': 'new.csv', 'size': 1})
            self.assertEqual(response.status_code, 400)
            cleanup_deleted()
            response = self.write(f"/api/v1/releases/{another['id']}/files/", {'path': 'new.csv', 'size': 1})
            self.assertEqual(response.status_code, 201)
        self.assertFalse(ArtifactDeletion.objects.exists())
        self.assertFalse(storage().exists(item.storage_key))

    def test_owner_can_switch_visibility_for_models_and_datasets_without_changing_manifests(self):
        anonymous = Client()
        other = Client()
        other.force_login(self.other)
        for kind in ['dataset', 'model']:
            with self.subTest(kind=kind):
                repository, release = self.create(kind, slug=f'{kind}-visibility')
                item = self.ready_release(release, kind)
                draft = self.write(f"/api/v1/repositories/{repository['id']}/releases/", {'version': 'next'})
                self.assertEqual(draft.status_code, 201)
                release_row = Release.objects.get(pk=release['id'])
                manifest_before = release_row.manifest
                digest_before = release_row.manifest_sha256
                url = f"/api/v1/repositories/{repository['id']}/"
                self.assertEqual(anonymous.get(url).status_code, 404)
                with self.captureOnCommitCallbacks(execute=True):
                    response = self.write(url, {'visibility': 'public'}, method='patch')
                self.assertEqual(response.status_code, 200, response.content)
                self.assertEqual(response.json()['latest_release']['id'], release['id'])
                self.assertEqual(anonymous.get(url).status_code, 200)
                public = anonymous.get(f'/api/v1/repositories/?kind={kind}&scope=public').json()
                self.assertEqual(public['count'], 1)
                self.assertEqual(anonymous.get(f"/api/v1/releases/{draft.json()['id']}/").status_code, 404)
                manifest_url = f"/api/v1/releases/{release['id']}/manifest/"
                download_url = f'/api/v1/artifacts/{item.pk}/download/'
                self.assertEqual(anonymous.get(manifest_url).status_code, 200)
                download = anonymous.get(download_url)
                self.assertEqual(download.status_code, 200)
                self.assertTrue(b''.join(download.streaming_content))
                self.assertEqual(self.write(url, {'visibility': 'private'}, method='patch', client=other).status_code, 403)
                # Populate public counts before testing visibility cache invalidation.
                self.assertEqual(anonymous.get('/api/v1/statistics/').json()[kind + 's'], 1)
                with self.captureOnCommitCallbacks(execute=True):
                    response = self.write(url, {'visibility': 'private'}, method='patch')
                self.assertEqual(response.status_code, 200)
                for endpoint in [url, f"/api/v1/releases/{release['id']}/", manifest_url, download_url]:
                    self.assertEqual(anonymous.get(endpoint).status_code, 404, endpoint)
                    self.assertEqual(other.get(endpoint).status_code, 404, endpoint)
                self.assertEqual(self.client.get(manifest_url).status_code, 200)
                self.assertEqual(anonymous.get('/api/v1/statistics/').json()[kind + 's'], 0)
                release_row.refresh_from_db()
                self.assertEqual(release_row.manifest, manifest_before)
                self.assertEqual(release_row.manifest_sha256, digest_before)
                self.assertTrue(release_row.events.filter(action='visibility_public', actor=self.user).exists())
                self.assertTrue(release_row.events.filter(action='visibility_private', actor=self.user).exists())

    def test_visibility_changes_do_not_expose_drafts_or_bypass_personal_data_rules(self):
        repository, release = self.create()
        url = f"/api/v1/repositories/{repository['id']}/"
        self.assertEqual(self.write(url, {'visibility': 'public'}, method='patch').status_code, 200)
        self.assertEqual(Client().get(url).status_code, 404)
        self.write(url, {'visibility': 'private'}, method='patch')
        self.assertEqual(self.write(f"/api/v1/releases/{release['id']}/", {'metadata': {**metadata(), 'contains_personal_data': 'yes'}}, method='patch').status_code, 200)
        self.ready_release(release)
        response = self.write(url, {'visibility': 'public'}, method='patch')
        self.assertEqual(response.status_code, 400)
        self.assertIn('personal data', response.content.decode())
        self.assertEqual(Repository.objects.get(pk=repository['id']).visibility, 'private')

    def test_public_visibility_requires_accessible_upstream_and_private_sources_remain_protected(self):
        upstream, source = self.create(slug='upstream')
        self.ready_release(source)
        target, release = self.create(slug='derived')
        self.assertEqual(self.write(f"/api/v1/releases/{release['id']}/", {'sources': [{'source': source['id'], 'relation': 'derived_from'}]}, method='patch').status_code, 200)
        self.ready_release(release)
        target_url = f"/api/v1/repositories/{target['id']}/"
        self.assertEqual(self.write(target_url, {'visibility': 'public'}, method='patch').status_code, 400)
        upstream_url = f"/api/v1/repositories/{upstream['id']}/"
        self.assertEqual(self.write(upstream_url, {'visibility': 'public'}, method='patch').status_code, 200)
        self.assertEqual(self.write(target_url, {'visibility': 'public'}, method='patch').status_code, 200)
        self.assertEqual(self.write(upstream_url, {'visibility': 'private'}, method='patch').status_code, 200)
        self.assertEqual(Client().get(f"/api/v1/releases/{source['id']}/manifest/").status_code, 404)
        self.assertEqual(Client().get(target_url).status_code, 200)

    def test_visibility_change_respects_production_scan_requirements(self):
        repository, release = self.create()
        self.ready_release(release)
        with override_settings(DEBUG=False, UPLOAD_SCAN_MODE='clamav'):
            response = self.write(f"/api/v1/repositories/{repository['id']}/", {'visibility': 'public'}, method='patch')
        self.assertEqual(response.status_code, 409)
        self.assertEqual(Repository.objects.get(pk=repository['id']).visibility, 'private')

    def test_dataset_upload_validation_publication_manifest_and_download(self):
        repository, release = self.create(visibility='public')
        anonymous = Client()
        self.assertEqual(anonymous.get(f"/api/v1/repositories/{repository['id']}/").status_code, 404)
        reservation = self.reserve(release)
        item = self.upload(reservation)
        self.assertEqual(self.publish(release).status_code, 409)
        self.assertEqual(self.client.get(f'/api/v1/artifacts/{item.pk}/download/').status_code, 409)
        self.assertTrue(process_one())
        item.refresh_from_db()
        self.assertEqual(item.status, 'ready')
        self.assertEqual(item.scan_status, 'not_scanned')
        self.assertEqual(item.sha256, hashlib.sha256(b'text,label\nhello,1\n').hexdigest())
        response = self.publish(release)
        self.assertEqual(response.status_code, 200, response.content)
        manifest = anonymous.get(f"/api/v1/releases/{release['id']}/manifest/").json()
        digest = hashlib.sha256(json.dumps(manifest['manifest'], sort_keys=True, separators=(',', ':'), ensure_ascii=False).encode()).hexdigest()
        self.assertEqual(digest, manifest['sha256'])
        self.assertEqual(anonymous.get(f"/api/v1/repositories/{repository['id']}/").status_code, 200)
        download = anonymous.get(f'/api/v1/artifacts/{item.pk}/download/')
        self.assertEqual(download.status_code, 200)
        self.assertIn('attachment', download['Content-Disposition'])
        self.assertEqual(download['X-Checksum-SHA256'], item.sha256)
        self.assertEqual(b''.join(download.streaming_content), b'text,label\nhello,1\n')
        self.assertTrue(ReleaseEvent.objects.filter(release_id=release['id'], action='published', actor=self.user).exists())

    def test_model_configuration_and_weights_are_accepted_without_execution(self):
        _, release = self.create('model')
        content = b'{"architecture":"linear"}'
        item = self.upload(self.reserve(release, 'config.json', content), content)
        self.assertTrue(process_one())
        item.refresh_from_db()
        self.assertEqual(item.status, 'ready')
        self.assertEqual(self.publish(release).status_code, 400)
        weights = b'opaque pytorch bytes stored without torch.load'
        self.upload(self.reserve(release, 'model.pt', weights), weights)
        self.assertTrue(process_one())
        self.assertEqual(self.publish(release).status_code, 200)

    def test_anonymous_model_catalog_summary_uses_published_version_only(self):
        repository, release = self.create('model', 'public', 'speech-model')
        self.write(f"/api/v1/repositories/{repository['id']}/", {'name': 'Speech model'}, method='patch')
        weights = b'opaque model weight fixture'
        self.upload(self.reserve(release, 'model.pt', weights), weights)
        process_one()
        self.assertEqual(self.publish(release).status_code, 200)
        draft = self.write(f"/api/v1/repositories/{repository['id']}/releases/", {'version': '2.0.0', 'metadata': {**metadata('model'), 'framework': 'tensorflow'}})
        self.assertEqual(draft.status_code, 201)
        self.create('model', 'private', 'secret-model')
        anonymous = Client()
        response = anonymous.get('/api/v1/repositories/?scope=public&kind=model&search=speech&ordering=name')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['count'], 1)
        summary = response.json()['results'][0]['latest_release']
        self.assertEqual(summary['version'], '1.0.0')
        self.assertEqual(summary['metadata']['framework'], 'pytorch')
        self.assertEqual(summary['file_count'], 1)
        self.assertEqual(summary['total_size'], len(weights))
        self.assertNotIn('2.0.0', response.content.decode())

    def test_other_users_cannot_access_private_releases_or_spoof_owner(self):
        repository, release = self.create()
        reservation = self.reserve(release)
        self.upload(reservation)
        process_one()
        self.client.force_login(self.other)
        for path in [f"/api/v1/repositories/{repository['id']}/", f"/api/v1/releases/{release['id']}/", f"/api/v1/artifacts/{reservation['file']['id']}/download/"]:
            self.assertEqual(self.client.get(path, HTTP_USER_ID=str(self.user.pk)).status_code, 404)
        self.assertEqual(self.write(f"/api/v1/releases/{release['id']}/publish/").status_code, 404)

    def test_verified_login_and_csrf_are_required_for_mutations(self):
        anonymous = Client(enforce_csrf_checks=True)
        self.assertEqual(self.write('/api/v1/repositories/', {'name': 'Bad'}, client=anonymous).status_code, 403)
        self.assertEqual(self.client.post('/api/v1/repositories/', {}, content_type='application/json').status_code, 403)
        EmailAddress.objects.filter(user=self.user).update(verified=False)
        self.assertEqual(self.write('/api/v1/repositories/', {'name': 'Bad'}).status_code, 403)

    def test_published_release_cannot_be_edited_or_have_files_removed(self):
        _, release = self.create()
        reservation = self.reserve(release)
        self.upload(reservation)
        process_one()
        self.assertEqual(self.publish(release).status_code, 200)
        self.assertEqual(self.write(f"/api/v1/releases/{release['id']}/", {'card': 'changed'}, method='patch').status_code, 409)
        self.assertEqual(self.write(f"/api/v1/releases/{release['id']}/files/", {'path': 'another.csv', 'size': 2}).status_code, 409)
        self.assertEqual(self.write(f"/api/v1/artifacts/{reservation['file']['id']}/", method='delete').status_code, 409)
        self.assertEqual(self.publish(release).status_code, 200)

    def test_checksum_mismatch_is_quarantined_and_can_be_removed(self):
        _, release = self.create()
        item = self.upload(self.reserve(release, checksum='0' * 64))
        process_one()
        item.refresh_from_db()
        self.assertEqual(item.status, 'rejected')
        self.assertIn('checksum', item.error)
        self.assertEqual(self.client.get(f'/api/v1/artifacts/{item.pk}/download/').status_code, 409)
        self.assertEqual(self.publish(release).status_code, 409)
        key = item.storage_key
        self.assertEqual(self.write(f'/api/v1/artifacts/{item.pk}/', method='delete').status_code, 204)
        self.assertFalse(storage().exists(key))
        # A removed filename can be reserved again without mutating the old record.
        self.reserve(release)

    def test_file_size_quota_case_duplicates_and_path_traversal(self):
        _, release = self.create()
        endpoint = f"/api/v1/releases/{release['id']}/files/"
        for path in ['../data.csv', '/data.csv', 'a/../data.csv', 'a\\data.csv', 'C:/data.csv', 'script.exe', 'model.pkl', 'a//data.csv']:
            self.assertEqual(self.write(endpoint, {'path': path, 'size': 10}).status_code, 400, path)
        with override_settings(UPLOAD_MAX_FILE_BYTES=5):
            self.assertEqual(self.write(endpoint, {'path': 'data.csv', 'size': 6}).status_code, 400)
        with override_settings(UPLOAD_USER_QUOTA_BYTES=15):
            self.assertEqual(self.write(endpoint, {'path': 'data.csv', 'size': 10}).status_code, 201)
            self.assertEqual(self.write(endpoint, {'path': 'other.csv', 'size': 10}).status_code, 400)
        self.assertEqual(self.write(endpoint, {'path': 'DATA.csv', 'size': 10}).status_code, 409)

    def test_size_mismatch_and_reused_upload_sessions_are_rejected(self):
        _, release = self.create()
        reservation = self.reserve(release)
        token = self.client.get('/api/v1/accounts/csrf/').json()['csrfToken']
        response = self.client.put(reservation['upload_url'], b'a', content_type='application/octet-stream', HTTP_X_CSRFTOKEN=token)
        self.assertEqual(response.status_code, 400)
        self.upload(reservation)
        response = self.client.put(reservation['upload_url'], b'text,label\nhello,1\n', content_type='application/octet-stream', HTTP_X_CSRFTOKEN=token)
        self.assertEqual(response.status_code, 409)

    def test_archive_traversal_executable_and_bomb_are_rejected(self):
        _, release = self.create()
        for index, (name, content) in enumerate([('../outside.csv', b'a,b'), ('payload.exe', b'MZ'), ('large.csv', b'0' * 200000)]):
            output = BytesIO()
            with zipfile.ZipFile(output, 'w', compression=zipfile.ZIP_DEFLATED) as archive:
                archive.writestr(name, content)
            data = output.getvalue()
            item = self.upload(self.reserve(release, f'archive{index}.zip', data), data)
            process_one()
            item.refresh_from_db()
            self.assertEqual(item.status, 'rejected')

    def test_invalid_json_and_inconsistent_csv_are_rejected(self):
        _, release = self.create()
        for path, data in [('broken.json', b'{not json'), ('broken.csv', b'a,b\n1,2,3\n'), ('fake.png', b'not a png')]:
            item = self.upload(self.reserve(release, path, data), data)
            process_one()
            item.refresh_from_db()
            self.assertEqual(item.status, 'rejected')

    def test_metadata_and_personal_data_publication_rules(self):
        _, release = self.create(visibility='public')
        endpoint = f"/api/v1/releases/{release['id']}/"
        invalid = metadata()
        invalid['unexpected'] = 'not in schema'
        self.assertEqual(self.write(endpoint, {'metadata': invalid}, method='patch').status_code, 400)
        personal = {**metadata(), 'contains_personal_data': 'yes'}
        self.assertEqual(self.write(endpoint, {'metadata': personal}, method='patch').status_code, 200)
        self.upload(self.reserve(release))
        process_one()
        self.assertEqual(self.publish(release).status_code, 400)

    def test_production_publication_requires_scanning_and_scanner_fails_closed(self):
        _, release = self.create()
        self.upload(self.reserve(release))
        process_one()
        with override_settings(DEBUG=False, UPLOAD_SCAN_MODE='clamav'):
            self.assertEqual(self.publish(release).status_code, 409)
            with patch('artifacts.validation.socket.create_connection', side_effect=OSError('not running')):
                with self.assertRaises(OSError):
                    malware_scan(BytesIO(b'data'))
        with override_settings(DEBUG=False, UPLOAD_SCAN_MODE='development'):
            with self.assertRaises(ValueError):
                malware_scan(BytesIO(b'data'))

    def test_clean_scanner_result_allows_production_publication(self):
        _, release = self.create()
        item = self.upload(self.reserve(release))
        connection = MagicMock()
        connection.__enter__.return_value = connection
        connection.recv.return_value = b'stream: OK\0'
        with override_settings(DEBUG=False, UPLOAD_SCAN_MODE='clamav'):
            with patch('artifacts.validation.socket.create_connection', return_value=connection):
                self.assertTrue(process_one())
            item.refresh_from_db()
            self.assertEqual(item.scan_status, 'clean')
            self.assertIsNotNone(item.validated_at)
            self.assertEqual(self.publish(release).status_code, 200)

    def test_parent_versions_and_provenance_require_exact_accessible_releases(self):
        repository, first = self.create()
        self.upload(self.reserve(first))
        process_one()
        self.assertEqual(self.publish(first).status_code, 200)
        response = self.write(f"/api/v1/repositories/{repository['id']}/releases/", {'version': '2.0.0', 'parent': first['id'], 'sources': [{'source': first['id'], 'relation': 'derived_from'}]})
        self.assertEqual(response.status_code, 201, response.content)
        self.assertEqual(response.json()['parent'], first['id'])
        self.assertEqual(response.json()['sources'][0]['source'], first['id'])
        second = response.json()
        bad = self.write(f"/api/v1/releases/{second['id']}/", {'sources': [{'source': first['id'], 'relation': 'trained_on'}]}, method='patch')
        self.assertEqual(bad.status_code, 400)
        # A public model must not reveal a private dataset source.
        model, version = self.create('model', 'public', 'classifier')
        self.assertEqual(self.write(f"/api/v1/releases/{version['id']}/", {'sources': [{'source': first['id'], 'relation': 'trained_on'}]}, method='patch').status_code, 400)

    def test_expired_sessions_release_quota_and_validation_leases_recover(self):
        _, release = self.create()
        reservation = self.reserve(release)
        Artifact.objects.filter(pk=reservation['file']['id']).update(expires_at=timezone.now() - timedelta(seconds=1))
        cleanup_expired()
        self.assertEqual(Artifact.objects.get(pk=reservation['file']['id']).status, 'cancelled')
        item = self.upload(self.reserve(release))
        Artifact.objects.filter(pk=item.pk).update(status='validating', expires_at=timezone.now() - timedelta(seconds=1))
        process_one()
        item.refresh_from_db()
        self.assertEqual(item.status, 'ready')

    def test_nas_marker_is_required_and_storage_has_no_public_url(self):
        with override_settings(ARTIFACT_STORAGE_ROOT=self.directory.name):
            with self.assertRaises(ImproperlyConfigured):
                storage().save('test/data', ContentFile(b'test'))
            (Path(self.directory.name) / '.oja-storage-root').write_text('oja-artifacts-v1\n')
            key = storage().save('test/data', ContentFile(b'test'))
            with storage().open(key) as stream:
                self.assertEqual(stream.read(), b'test')
            with self.assertRaises(NotImplementedError):
                storage().url(key)
            storage().delete(key)

    def test_metadata_request_size_is_bounded_before_json_parsing(self):
        with override_settings(DATA_UPLOAD_MAX_MEMORY_SIZE=32):
            response = self.write('/api/v1/repositories/', {'name': 'x' * 1000})
        self.assertEqual(response.status_code, 413)

    def test_nas_unavailability_does_not_silently_fall_back_to_local_disk(self):
        _, release = self.create()
        with override_settings(ARTIFACT_STORAGE_ROOT=self.directory.name):
            response = self.write(f"/api/v1/releases/{release['id']}/files/", {'path': 'data.csv', 'size': 10})
        self.assertEqual(response.status_code, 503)
        self.assertFalse(Artifact.objects.filter(release_id=release['id']).exists())


@override_settings(DEBUG=True, UPLOAD_SCAN_MODE='development', ARTIFACT_STORAGE_ROOT='', UPLOAD_USER_QUOTA_BYTES=15)
class ConcurrentQuotaTests(TransactionTestCase):
    def test_simultaneous_reservations_cannot_exceed_owner_quota(self):
        cache.clear()
        user = User.objects.create_user(username='concurrent', email='concurrent@example.com')
        EmailAddress.objects.create(user=user, email=user.email, verified=True)
        repository = Repository.objects.create(owner=user, kind='dataset', name='Race', slug='race')
        release = Release.objects.create(repository=repository, created_by=user, version='1')
        barrier = Barrier(2)
        def reserve(name):
            close_old_connections()
            client = APIClient()
            client.force_authenticate(user=user)
            try:
                barrier.wait(timeout=10)
                return client.post(f'/api/v1/releases/{release.pk}/files/', {'path': name, 'size': 10}, format='json').status_code
            finally:
                connections.close_all()
        with ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(reserve, ['a.csv', 'b.csv']))
        self.assertEqual(sorted(results), [201, 400])
        self.assertEqual(Artifact.objects.filter(release=release).count(), 1)


@override_settings(DEBUG=True, UPLOAD_SCAN_MODE='development')
class ConcurrentVisibilityTests(TransactionTestCase):
    def test_public_visibility_and_publication_cannot_expose_personal_data(self):
        cache.clear()
        user = User.objects.create_user(username='visibility-race', email='visibility-race@example.com')
        EmailAddress.objects.create(user=user, email=user.email, verified=True)
        repository = Repository.objects.create(owner=user, kind='dataset', name='Race', slug='race')
        release = Release.objects.create(repository=repository, created_by=user, version='1', metadata={**metadata(), 'contains_personal_data': 'yes'}, card='Private dataset', changelog='Initial', rights_confirmed=True)
        Artifact.objects.create(release=release, path='data.csv', declared_size=10, size=10, status='ready', scan_status='clean', sha256='a' * 64, expires_at=timezone.now() + timedelta(days=1), validated_at=timezone.now())
        barrier = Barrier(2)

        def change(operation):
            close_old_connections()
            client = APIClient()
            client.force_authenticate(user=user)
            try:
                barrier.wait(timeout=10)
                if operation == 'publish':
                    return client.post(f'/api/v1/releases/{release.pk}/publish/', {}, format='json').status_code
                return client.patch(f'/api/v1/repositories/{repository.pk}/', {'visibility': 'public'}, format='json').status_code
            finally:
                connections.close_all()

        with ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(change, ['publish', 'visibility']))
        self.assertEqual(sorted(results), [200, 400])
        repository.refresh_from_db()
        release.refresh_from_db()
        self.assertFalse(repository.visibility == 'public' and release.status == 'published')
