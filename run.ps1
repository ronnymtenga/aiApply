param(
    [Parameter(Mandatory=$true)][string]$job,
    [string]$provider = "anthropic",
    [switch]$skipCalibration,
    [switch]$dryRun
)

if (-not (Test-Path ".env")) {
    Write-Error "No .env file found. Copy .env.example to .env and add your API key."
    exit 1
}

# Parse .env manually to avoid Docker --env-file encoding issues on Windows
$envArgs = @()
Get-Content ".env" | ForEach-Object {
    $line = $_.Trim()
    if ($line -and -not $line.StartsWith("#")) {
        $envArgs += "-e"
        $envArgs += $line
    }
}

$appArgs = @("--job", $job, "--provider", $provider)
if ($skipCalibration) { $appArgs += "--skip-calibration" }
if ($dryRun) { $appArgs += "--dry-run" }

docker run --rm `
    -v "${PWD}/inputs:/app/inputs" `
    -v "${PWD}/outputs:/app/outputs" `
    -v "${PWD}/state:/app/state" `
    @envArgs `
    ai-apply @appArgs
