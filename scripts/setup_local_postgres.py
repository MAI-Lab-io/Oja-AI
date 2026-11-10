"""Initialize only this project's local development PostgreSQL cluster."""
from pathlib import Path
import secrets
import subprocess

import psycopg
from psycopg import sql

root = Path(__file__).resolve().parent.parent
pg = root / '.local' / 'postgres'
data = pg / 'data'
config = root / '.env.django'
if config.exists():
    raise SystemExit('Existing config detected. Nothing changed. Use scripts/local-postgres.ps1 start.')
binary = pg / 'pgsql' / 'bin' / 'initdb.exe'
if not binary.exists():
    raise SystemExit('Extract official PostgreSQL binaries under .local/postgres/pgsql first.')
recovery_file = pg / 'admin-password.txt'
if data.exists() and not recovery_file.exists():
    raise SystemExit('Existing cluster without recovery credentials detected. Nothing changed.')
admin_password = recovery_file.read_text(encoding='utf-8') if recovery_file.exists() else secrets.token_hex(32)
app_password = secrets.token_hex(32)
password_file = pg / 'init-password.tmp'
recovery_file.write_text(admin_password, encoding='utf-8')
if not data.exists():
    password_file.write_text(admin_password, encoding='utf-8')
    try:
        subprocess.run([str(binary), '-D', str(data), '-U', 'oja_admin', '--pwfile', str(password_file),
                        '--auth=scram-sha-256', '--encoding=UTF8', '--locale=C'], check=True)
    finally:
        password_file.unlink(missing_ok=True)
    with (data / 'postgresql.conf').open('a', encoding='utf-8') as stream:
        stream.write("\nlisten_addresses = '127.0.0.1'\nport = 5432\nmax_connections = 50\n")
subprocess.run(['powershell', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File',
                str(root / 'scripts' / 'local-postgres.ps1'), 'start'], check=True)
with psycopg.connect(host='127.0.0.1', port=5432, user='oja_admin', password=admin_password,
                     dbname='postgres', autocommit=True, connect_timeout=5) as connection:
    # CREATEDB permits Django's isolated test database; remove it for production.
    connection.execute(sql.SQL('CREATE ROLE oja LOGIN CREATEDB PASSWORD {}').format(sql.Literal(app_password)))
    connection.execute('CREATE DATABASE oja_ai OWNER oja')
settings = (root / '.env.django.example').read_text(encoding='utf-8')
settings = settings.replace('postgresql://oja:oja@', f'postgresql://oja:{app_password}@')
settings = settings.replace('development-only-change-before-deployment-1234567890', secrets.token_urlsafe(64))
config.write_text(settings, encoding='utf-8')
# A local recovery credential; never printed or committed.
print('Local PostgreSQL initialized; .env.django written. Credentials were not printed.')
