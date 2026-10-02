param(
  [switch]$SkipUpload
)

$ErrorActionPreference = "Stop"

$Repo = "xiaoyuan1124/PORTFOLIOPILOT"
$EnvironmentName = "portfolio-testflight"
$BundleId = "com.sy1124.portfoliopilot"
$Workflow = "testflight-upload.yml"

function Require-Command {
  param([string]$Name)
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "Required command '$Name' was not found. Install GitHub CLI (gh) and try again."
  }
}

function Require-Match {
  param(
    [string]$Value,
    [string]$Pattern,
    [string]$Label
  )
  if ($Value -notmatch $Pattern) {
    throw "$Label has an unexpected format."
  }
}

Write-Host "PortfolioPilot TestFlight bootstrap" -ForegroundColor Cyan
Write-Host "Repository: $Repo"
Write-Host "Environment: $EnvironmentName"
Write-Host "Bundle ID: $BundleId"
Write-Host ""

Require-Command "gh"

Write-Host "Checking GitHub authentication..."
& gh auth status
if ($LASTEXITCODE -ne 0) {
  throw "GitHub CLI is not authenticated. Run 'gh auth login' first."
}

Write-Host "Checking repository access..."
& gh repo view $Repo --json nameWithOwner --jq ".nameWithOwner"
if ($LASTEXITCODE -ne 0) {
  throw "Unable to access $Repo with the current GitHub account."
}

$TeamId = (Read-Host "Apple Team ID (10 characters)").Trim()
Require-Match -Value $TeamId -Pattern "^[A-Z0-9]{10}$" -Label "Apple Team ID"

$KeyId = (Read-Host "App Store Connect Team API Key ID").Trim()
Require-Match -Value $KeyId -Pattern "^[A-Z0-9]{8,20}$" -Label "App Store Connect Key ID"

$IssuerId = (Read-Host "App Store Connect Issuer ID (UUID)").Trim()
Require-Match -Value $IssuerId -Pattern "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$" -Label "App Store Connect Issuer ID"

$P8PathInput = (Read-Host "Full path to the downloaded AuthKey_*.p8 file").Trim('"').Trim()
if (-not (Test-Path -LiteralPath $P8PathInput -PathType Leaf)) {
  throw "The .p8 file was not found at: $P8PathInput"
}
if ([IO.Path]::GetExtension($P8PathInput) -ne ".p8") {
  throw "Expected a .p8 private key file."
}

$P8Bytes = [IO.File]::ReadAllBytes((Resolve-Path -LiteralPath $P8PathInput))
if ($P8Bytes.Length -lt 100) {
  throw "The .p8 file appears unexpectedly small."
}
$P8Base64 = [Convert]::ToBase64String($P8Bytes)

Write-Host ""
Write-Host "Creating/updating GitHub environment '$EnvironmentName'..."
& gh api --method PUT "repos/$Repo/environments/$EnvironmentName" | Out-Null
if ($LASTEXITCODE -ne 0) {
  throw "Failed to create or update the GitHub environment."
}

Write-Host "Writing PortfolioPilot-only environment secrets..."
$Secrets = @{
  "PORTFOLIOPILOT_APPLE_TEAM_ID" = $TeamId
  "PORTFOLIOPILOT_ASC_KEY_ID" = $KeyId
  "PORTFOLIOPILOT_ASC_ISSUER_ID" = $IssuerId
  "PORTFOLIOPILOT_ASC_API_KEY_P8_BASE64" = $P8Base64
}

foreach ($Name in $Secrets.Keys) {
  & gh secret set $Name --repo $Repo --env $EnvironmentName --body $Secrets[$Name]
  if ($LASTEXITCODE -ne 0) {
    throw "Failed to set environment secret: $Name"
  }
}

$P8Base64 = $null
[GC]::Collect()

Write-Host ""
Write-Host "Verifying environment secret names..."
$SecretList = & gh secret list --repo $Repo --env $EnvironmentName
if ($LASTEXITCODE -ne 0) {
  throw "Unable to list environment secrets."
}

foreach ($Name in $Secrets.Keys) {
  if ($SecretList -notmatch [regex]::Escape($Name)) {
    throw "Secret was not found after creation: $Name"
  }
}
Write-Host "All four required environment secrets exist." -ForegroundColor Green

$MainMeta = & gh api "repos/$Repo/contents/native/app-store.json?ref=main" --jq ".content"
if ($LASTEXITCODE -ne 0) {
  throw "Unable to read native/app-store.json from main."
}
$MainMetaJson = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String(($MainMeta -replace "\s",""))) | ConvertFrom-Json

if ($MainMetaJson.bundleId -ne $BundleId) {
  throw "main bundle ID mismatch: expected $BundleId, got $($MainMetaJson.bundleId)"
}

$MainSha = (& gh api "repos/$Repo/commits/main" --jq ".sha").Trim()
if ($LASTEXITCODE -ne 0 -or -not $MainSha) {
  throw "Unable to resolve main SHA."
}

Write-Host ""
Write-Host "Ready:"
Write-Host "  Version: $($MainMetaJson.version)"
Write-Host "  Build:   $($MainMetaJson.buildNumber)"
Write-Host "  Bundle:  $($MainMetaJson.bundleId)"
Write-Host "  Main:    $MainSha"

if ($SkipUpload) {
  Write-Host ""
  Write-Host "Secrets are configured. Upload was skipped by -SkipUpload." -ForegroundColor Yellow
  exit 0
}

Write-Host ""
$Confirm = Read-Host "Type UPLOAD to start a real TestFlight upload now"
if ($Confirm -ne "UPLOAD") {
  Write-Host "Secrets are configured. Upload was not started." -ForegroundColor Yellow
  exit 0
}

Write-Host "Dispatching guarded TestFlight workflow..."
& gh workflow run $Workflow --repo $Repo --ref main -f confirm_upload=UPLOAD -f confirm_bundle_id=$BundleId
if ($LASTEXITCODE -ne 0) {
  throw "Failed to dispatch the TestFlight workflow."
}

Start-Sleep -Seconds 5

$RunsJson = & gh run list --repo $Repo --workflow $Workflow --branch main --event workflow_dispatch --limit 10 --json databaseId,headSha,status,conclusion,createdAt,url
if ($LASTEXITCODE -ne 0) {
  throw "Upload was dispatched, but the workflow run could not be located."
}

$Runs = $RunsJson | ConvertFrom-Json
$Run = $Runs | Where-Object { $_.headSha -eq $MainSha } | Sort-Object { [DateTime]$_.createdAt } -Descending | Select-Object -First 1

if (-not $Run) {
  Write-Host "Upload was dispatched but the exact run was not found yet." -ForegroundColor Yellow
  Write-Host "Open GitHub Actions > TestFlight Upload to continue monitoring."
  exit 0
}

Write-Host "Watching run $($Run.databaseId): $($Run.url)"
& gh run watch $Run.databaseId --repo $Repo --exit-status
if ($LASTEXITCODE -ne 0) {
  throw "TestFlight workflow failed. Open $($Run.url) and inspect the failed step."
}

Write-Host ""
Write-Host "GitHub reports the TestFlight upload workflow succeeded." -ForegroundColor Green
Write-Host "Next: wait for Apple processing, then verify build $($MainMetaJson.version) ($($MainMetaJson.buildNumber)) in App Store Connect > TestFlight."
