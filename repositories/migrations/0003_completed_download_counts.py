from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [('repositories', '0002_repository_download_count')]

    operations = [
        # Preserve the old request-start totals rather than describing them as
        # completed streams or destroying their history.
        migrations.RenameField('repository', 'download_count', 'download_request_count'),
        migrations.AddField(
            model_name='repository',
            name='download_count',
            field=models.PositiveBigIntegerField(default=0, editable=False),
        ),
    ]
