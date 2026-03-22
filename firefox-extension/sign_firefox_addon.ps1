Param(
    [string]$Version = "1.0.3",
    [string]$DefaultIssuer = "user:13666034:490"
)

$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $PSScriptRoot
$Dist = Join-Path $Root "dist"
$Source = Join-Path $Root "firefox-extension"
$ZipPath = Join-Path $Dist "athens-weather-forecast-$Version.zip"
$UnsignedXpiPath = Join-Path $Dist "athens-weather-forecast-$Version.xpi"

if (-not $env:AMO_JWT_ISSUER -and $DefaultIssuer) {
    $env:AMO_JWT_ISSUER = $DefaultIssuer
}

if (-not $env:AMO_JWT_ISSUER -or -not $env:AMO_JWT_SECRET) {
    Write-Host "Missing AMO credentials." -ForegroundColor Red
    Write-Host "Set environment variables first:" -ForegroundColor Yellow
    Write-Host "  AMO_JWT_ISSUER = your AMO API key" -ForegroundColor Yellow
    Write-Host "  AMO_JWT_SECRET = your AMO API secret" -ForegroundColor Yellow
    exit 1
}

if ($env:AMO_JWT_ISSUER -eq "YOUR_AMO_API_KEY" -or $env:AMO_JWT_SECRET -eq "YOUR_AMO_API_SECRET") {
    Write-Host "Placeholder AMO credentials detected." -ForegroundColor Red
    Write-Host "Replace with real values from addons.mozilla.org/developers/addon/api/key" -ForegroundColor Yellow
    exit 1
}

New-Item -ItemType Directory -Force -Path $Dist | Out-Null

if (Test-Path $ZipPath) { Remove-Item $ZipPath -Force }
if (Test-Path $UnsignedXpiPath) { Remove-Item $UnsignedXpiPath -Force }

Compress-Archive -Path (Join-Path $Source "*") -DestinationPath $ZipPath -Force
Copy-Item $ZipPath $UnsignedXpiPath -Force

Write-Host "Unsigned package created:" -ForegroundColor Cyan
Write-Host "  $UnsignedXpiPath" -ForegroundColor Cyan

$webExt = Get-Command web-ext -ErrorAction SilentlyContinue
if (-not $webExt) {
    Write-Host "web-ext not found. Install it with:" -ForegroundColor Red
    Write-Host "  npm install -g web-ext" -ForegroundColor Yellow
    exit 1
}

Push-Location $Source
try {
    web-ext sign --channel unlisted --api-key $env:AMO_JWT_ISSUER --api-secret $env:AMO_JWT_SECRET --artifacts-dir "$Dist"
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Signing failed. Verify your AMO API key/secret and try again." -ForegroundColor Red
        exit $LASTEXITCODE
    }
    Write-Host "Signed XPI generated in:" -ForegroundColor Green
    Write-Host "  $Dist" -ForegroundColor Green
}
finally {
    Pop-Location
}
