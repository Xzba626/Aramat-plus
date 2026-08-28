# Recreate local dev database (NO production data). Requires postgres superuser.
#
# Usage:
#   $env:PGPASSWORD = "aromat"
#   .\scripts\recreate-local-db.ps1

$ErrorActionPreference = "Stop"

$psql = "C:\Program Files\PostgreSQL\16\bin\psql.exe"
if (-not (Test-Path $psql)) {
  $found = Get-ChildItem "C:\Program Files\PostgreSQL\*\bin\psql.exe" -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($found) { $psql = $found.FullName }
  else { throw "psql.exe not found" }
}

if (-not $env:PGPASSWORD) {
  Write-Host 'Set: $env:PGPASSWORD = "your_postgres_password"' -ForegroundColor Yellow
  exit 1
}

Write-Host "Terminating connections to aromat_plus ..." -ForegroundColor Yellow
& $psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c @"
SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE datname = 'aromat_plus' AND pid <> pg_backend_pid();
"@

Write-Host "Ensuring role aromat exists ..." -ForegroundColor Green
& $psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c @"
DO `$`$ BEGIN
  CREATE ROLE aromat LOGIN PASSWORD 'aromat';
EXCEPTION WHEN duplicate_object THEN
  ALTER ROLE aromat WITH PASSWORD 'aromat';
END `$`$;
"@

Write-Host "Dropping and recreating aromat_plus (local dev only) ..." -ForegroundColor Yellow
& $psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS aromat_plus;"
& $psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c "CREATE DATABASE aromat_plus OWNER aromat;"
& $psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c "GRANT ALL PRIVILEGES ON DATABASE aromat_plus TO aromat;"

& $psql -U postgres -d aromat_plus -v ON_ERROR_STOP=1 -c @"
ALTER SCHEMA public OWNER TO aromat;
GRANT ALL ON SCHEMA public TO aromat;
"@

Write-Host ""
Write-Host "OK. Next:" -ForegroundColor Green
Write-Host "  npx prisma migrate deploy"
Write-Host "  npm run db:seed"
Write-Host "  npm run dev"
