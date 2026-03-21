# AI Apply — Job Application Pipeline

A CLI tool that generates tailored resumes and cover letters using an AI-powered 4-phase assembly line.

## How It Works

```
┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│   Phase 0    │    │   Phase 1    │    │   Phase 2    │    │   Phase 3    │
│ Calibration  │───▶│  Ingestion   │───▶│   Strategy   │───▶│  Generation  │
│              │    │              │    │              │    │              │
│ Extract your │    │ Parse job    │    │ Build a plan │    │ Write cover  │
│ writing      │    │ posting into │    │ for how to   │    │ letter +     │
│ voice/style  │    │ structured   │    │ position you │    │ resume in    │
│ from samples │    │ data         │    │ for the role │    │ YOUR voice   │
└──────────────┘    └──────────────┘    └──────────────┘    └──────────────┘
```

## Quick Start

### 1. Install dependencies

```bash
npm install
```

### 2. Set up your API key

```bash
cp .env.example .env
# Edit .env and add your Anthropic API key
```

### 3. Add your inputs

```
inputs/
├── profile.json              ← Auto-extracted from samples, or edit manually
├── golden_samples/           ← Drop past cover letters / resumes here
│   └── example_cover_letter.md
└── job_postings/             ← Saved here automatically when using URLs
    └── example_job.md
```

### 4. Run the pipeline

```bash
# Dry-run (validates inputs, no LLM calls, no API key needed)
npx tsx src/index.ts --job example_job.md --dry-run

# Full run with a local file
npx tsx src/index.ts --job example_job.md

# Full run with a URL (fetches and saves the posting automatically)
npx tsx src/index.ts --job https://boards.greenhouse.io/stripe/jobs/12345

# Skip calibration if you've already run it (reuses cached voice profile)
npx tsx src/index.ts --job example_job.md --skip-calibration
```

### 5. Check your outputs

```
outputs/
├── cover_letter.md     ← Your tailored cover letter
└── resume.md           ← Your tailored resume content

state/                  ← Intermediate files (for debugging)
├── author_style.json
├── job_context.json
└── tailoring_strategy.json
```

## Project Structure

```
src/
├── index.ts              ← Orchestrator (CLI entry point)
├── schemas.ts            ← Zod schemas for all JSON contracts
├── agents/
│   ├── calibration.ts    ← Phase 0 — voice/style + profile extraction
│   ├── ingestion.ts      ← Phase 1 — job description parsing
│   ├── strategy.ts       ← Phase 2 — tailoring strategy
│   └── generation.ts     ← Phase 3 — cover letter + resume
└── utils/
    ├── llm.ts            ← Shared LLM call helper
    └── scraper.ts        ← URL → Markdown fetcher (Jina AI Reader)
```

## CLI Options

| Flag | Description |
|------|-------------|
| `--job <source>` | **Required.** Job posting URL (`https://...`) or filename in `inputs/job_postings/` |
| `--skip-calibration` | Skip Phase 0 if `state/author_style.json` already exists |
| `--dry-run` | Validate all inputs and schemas without making LLM calls |
