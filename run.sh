#!/usr/bin/env bash
# Convenience wrapper — builds the image if needed, then runs the pipeline.
#
# Usage:
#   ./run.sh --job "https://jobs.example.com/some-role"
#   ./run.sh --job my_job.md --provider google
#   ./run.sh --job "https://..." --skip-calibration --provider openai
#
# Requirements:
#   - Docker installed and running
#   - A .env file in this directory with your API key (copy .env.example to get started)
#   - Your resume/cover letter samples in inputs/resumes/ and inputs/cover_letters/

set -euo pipefail

IMAGE="ai-apply"

if [ ! -f .env ]; then
  echo "❌ No .env file found. Copy .env.example to .env and add your API key."
  exit 1
fi

echo "🔨 Building Docker image (only rebuilds when source changes)..."
docker build -t "$IMAGE" .

echo "🚀 Running pipeline..."
docker run --rm \
  -v "$(pwd)/inputs:/app/inputs" \
  -v "$(pwd)/outputs:/app/outputs" \
  -v "$(pwd)/state:/app/state" \
  --env-file .env \
  "$IMAGE" "$@"
