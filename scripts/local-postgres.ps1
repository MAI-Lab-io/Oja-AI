param([ValidateSet('start', 'stop', 'status')][string]$Action = 'start')
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$pgRoot = Join-Path $projectRoot '.local/postgres'
$pgBin = Join-Path $pgRoot 'pgsql/bin'
$pgData = Join-Path $pgRoot 'data'
$pgLog = Join-Path $pgRoot 'server.log'
$pgCtl = Join-Path $pgBin 'pg_ctl.exe'
if (-not (Test-Path -LiteralPath $pgCtl)) {
    throw 'Extract official PostgreSQL Windows binaries under .local/postgres/pgsql first. See docs/accounts-setup.md.'
}
if ($Action -eq 'start' -and -not (Test-Path -LiteralPath (Join-Path $pgData 'PG_VERSION'))) {
    throw 'Run venv/Scripts/python.exe scripts/setup_local_postgres.py first.'
}
if ($Action -eq 'status') { & $pgCtl -D $pgData status; exit $LASTEXITCODE }
if ($Action -eq 'start') {
    & $pgCtl -D $pgData status *> $null
    if ($LASTEXITCODE -eq 0) { Write-Output 'Local PostgreSQL is already running.'; exit 0 }
    $pgArgs = @('-D', ('"' + $pgData + '"'), '-l', ('"' + $pgLog + '"'), '-w', 'start')
} else {
    $pgArgs = @('-D', ('"' + $pgData + '"'), '-m', 'fast', '-w', 'stop')
}
$pgProcess = Start-Process -FilePath $pgCtl -ArgumentList $pgArgs -WindowStyle Hidden -PassThru
# Start-Process -Wait waits for the entire tree, including the database server.
$pgProcess.WaitForExit()
if ($pgProcess.ExitCode -ne 0) { throw "PostgreSQL $Action failed. Inspect .local/postgres/server.log." }
Write-Output "Local PostgreSQL: $Action completed."
