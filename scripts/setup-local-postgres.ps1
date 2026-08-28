# Setup local PostgreSQL (NO Docker) for Aramat Plus
#
# Usage (PowerShell, from repo root):
#   $env:PGPASSWORD = "YOUR_POSTGRES_SUPERUSER_PASSWORD"
#   .\scripts\setup-local-postgres.ps1

$ErrorActionPreference = "Stop"

$psql = "C:\Program Files\PostgreSQL\16\bin\psql.exe"
if (-not (Test-Path $psql)) {
  $found = Get-ChildItem "C:\Program Files\PostgreSQL\*\bin\psql.exe" -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($found) { $psql = $found.FullName }
  else {
    throw "psql.exe not found. Install PostgreSQL from https://www.postgresql.org/download/windows/"
  }
}

if (-not $env:PGPASSWORD) {
  Write-Host "Set postgres superuser password first:" -ForegroundColor Yellow
  Write-Host '  $env:PGPASSWORD = "password_from_pg_install"' -ForegroundColor Cyan
  exit 1
}

function Invoke-Psql([string]$Sql) {
  & $psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c $Sql
}

Write-Host "Creating role aromat ..." -ForegroundColor Green
Invoke-Psql @"
DO `$`$ BEGIN
  CREATE ROLE aromat LOGIN PASSWORD 'aromat';
EXCEPTION WHEN duplicate_object THEN
  ALTER ROLE aromat WITH PASSWORD 'aromat';
END `$`$;
"@

$dbExists = & $psql -U postgres -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='aromat_plus'"
if ($dbExists -match "1") {
  Write-Host "Database aromat_plus already exists." -ForegroundColor Yellow
} else {
  Write-Host "Creating database aromat_plus ..." -ForegroundColor Green
  Invoke-Psql "CREATE DATABASE aromat_plus OWNER aromat;"
}

Invoke-Psql "GRANT ALL PRIVILEGES ON DATABASE aromat_plus TO aromat;"

Write-Host ""
Write-Host "OK. Next:" -ForegroundColor Green
Write-Host "  npx prisma migrate deploy"
Write-Host "  npm run db:seed"
Write-Host "  npm run dev"
Write-Host ""
Write-Host "Login: owner@aromat.plus / owner1234"
