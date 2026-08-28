# Reset PostgreSQL superuser password on Windows (NO Docker).
# MUST run PowerShell as Administrator.
#
# Usage:
#   Right-click PowerShell -> Run as administrator
#   cd D:\Aramat-plus
#   .\scripts\reset-postgres-password.ps1 -NewPassword "aromat"

param(
  [string]$NewPassword = "aromat",
  [string]$PgVersion = "16"
)

$ErrorActionPreference = "Stop"

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
  [Security.Principal.WindowsBuiltInRole]::Administrator
)
if (-not $isAdmin) {
  Write-Host "ERROR: Run PowerShell as Administrator." -ForegroundColor Red
  Write-Host "Right-click PowerShell -> Run as administrator, then run this script again."
  exit 1
}

$dataDir = "C:\Program Files\PostgreSQL\$PgVersion\data"
$pgHba = Join-Path $dataDir "pg_hba.conf"
$psql = "C:\Program Files\PostgreSQL\$PgVersion\bin\psql.exe"
$serviceName = "postgresql-x64-$PgVersion"

if (-not (Test-Path $pgHba)) {
  throw "Not found: $pgHba (try -PgVersion 16 or 17)"
}

$backup = "$pgHba.backup-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
Copy-Item $pgHba $backup
Write-Host "Backup: $backup" -ForegroundColor Gray

$content = Get-Content $pgHba -Raw
$trustBlock = @"
# TYPE  DATABASE        USER            ADDRESS                 METHOD
local   all             all                                     trust
host    all             all             127.0.0.1/32            trust
host    all             all             ::1/128                 trust
"@

$marker = "# TYPE  DATABASE        USER            ADDRESS                 METHOD"
$idx = $content.IndexOf($marker)
if ($idx -lt 0) {
  throw "pg_hba.conf format unexpected. Edit $pgHba manually."
}
$newContent = $content.Substring(0, $idx) + $trustBlock
[System.IO.File]::WriteAllText($pgHba, $newContent)

Write-Host "Restarting $serviceName ..." -ForegroundColor Yellow
Restart-Service $serviceName -Force
Start-Sleep -Seconds 3

Write-Host "Setting postgres password ..." -ForegroundColor Green
$sqlPassword = $NewPassword.Replace("'", "''")
$sql = "ALTER USER postgres WITH PASSWORD '$sqlPassword';"
& $psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c $sql

Write-Host "Restoring pg_hba.conf ..." -ForegroundColor Yellow
Copy-Item $backup $pgHba -Force
Restart-Service $serviceName -Force
Start-Sleep -Seconds 2

Write-Host ""
Write-Host "Done. postgres password = $NewPassword" -ForegroundColor Green
Write-Host ""
Write-Host "Next (normal PowerShell, project folder):"
Write-Host ('  $env:PGPASSWORD = "' + $NewPassword + '"')
Write-Host "  npm run db:setup-local"
Write-Host "  npx prisma migrate deploy"
Write-Host "  npm run db:seed"
Write-Host "  npm run dev"
Write-Host ""
Write-Host "Login: owner@aromat.plus / owner1234"
