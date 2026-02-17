# PostgreSQL setup for Firebird mirror databases (Windows Server)
# Run as Administrator:
#   .\scripts\setup-postgres.ps1 -SyncPass "fb_sync_password" -ReaderPass "fb_reader_password"
#
# Prerequisites: PostgreSQL installed, psql.exe in PATH

param(
    [Parameter(Mandatory=$true)][string]$SyncPass,
    [Parameter(Mandatory=$true)][string]$ReaderPass,
    [string]$PlantSubnet = "10.0.0.0/8"
)

$ErrorActionPreference = "Stop"

Write-Host "Creating users..."
psql -U postgres -c "CREATE USER fb_sync WITH PASSWORD '$SyncPass';" 2>$null
if ($LASTEXITCODE -ne 0) { Write-Host "  fb_sync already exists" }
psql -U postgres -c "CREATE USER fb_reader WITH PASSWORD '$ReaderPass';" 2>$null
if ($LASTEXITCODE -ne 0) { Write-Host "  fb_reader already exists" }

foreach ($DB in @("cmms", "formy")) {
    Write-Host "Setting up database: $DB..."
    psql -U postgres -c "CREATE DATABASE $DB OWNER fb_sync;" 2>$null
    if ($LASTEXITCODE -ne 0) { Write-Host "  $DB already exists" }

    psql -U postgres -d $DB -c "GRANT CONNECT ON DATABASE $DB TO fb_reader;"
    psql -U postgres -d $DB -c "ALTER DEFAULT PRIVILEGES FOR USER fb_sync IN SCHEMA public GRANT SELECT ON TABLES TO fb_reader;"
    psql -U postgres -d $DB -c "GRANT USAGE ON SCHEMA public TO fb_reader;"

    Write-Host "  $DB configured"
}

Write-Host ""
Write-Host "Add to pg_hba.conf (usually in PostgreSQL data directory):"
Write-Host "  host cmms,formy fb_sync  127.0.0.1/32    md5"
Write-Host "  host cmms,formy fb_reader $PlantSubnet  md5"
Write-Host ""
Write-Host "Then restart PostgreSQL service:"
Write-Host "  Restart-Service postgresql-x64-17"
