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

$args = @("--job", $job, "--provider", $provider)
if ($skipCalibration) { $args += "--skip-calibration" }
if ($dryRun) { $args += "--dry-run" }

docker run --rm `
    -v "${PWD}/inputs:/app/inputs" `
    -v "${PWD}/outputs:/app/outputs" `
    -v "${PWD}/state:/app/state" `
    --env-file .env `
    ai-apply @args
