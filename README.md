# AI Apply — Job Application Pipeline

A CLI tool that generates tailored resumes and cover letters using an AI-powered 4-phase assembly line. Now with **LaTeX Template Support**.

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
# Node dependencies
npm install

# System dependencies (Optional: for PDF auto-compilation)
# Arch: sudo pacman -S texlive-basic texlive-latexextra texlive-fontsrecommended
# Ubuntu: sudo apt install texlive-latex-base texlive-fonts-recommended
```

### 2. Set up your API key

```bash
cp .env.example .env
# Edit .env and add your GOOGLE_GENERATIVE_AI_API_KEY
```

### 3. Add your inputs

The pipeline supports both **Markdown** and **PDF** samples.

```
inputs/
├── profile.json              ← Auto-extracted from resumes, or edit manually
├── resumes/                 ← Drop your past PDF/MD resumes here
├── cover_letters/           ← Drop your past PDF/MD cover letters here
├── templates/               ← (Optional) Drop a resume.tex here for LaTeX output
└── job_postings/             ← Saved here automatically when using URLs
```

#### LaTeX Templates (Option B)
If you provide `inputs/templates/resume.tex`, the tool will look for variables like `{{SUMMARY}}`, `{{EXPERIENCE}}`, or `{{SKILLS}}` and inject tailored LaTeX code directly into your blueprint.

### 4. Run the pipeline

```bash
# Full run with a URL and specific provider
npm run dev -- --job https://linkedin.com/jobs/view/12345 --provider google

# Skip calibration (uses cached voice profile in state/author_style.json)
npm run dev -- --job example_job.md --skip-calibration
```

### 5. Check your outputs

```
outputs/
├── cover_letter.md     ← Your tailored cover letter
├── resume.md           ← Your tailored resume (Markdown)
└── resume.tex          ← Your tailored resume (LaTeX)
└── resume.pdf          ← Your final PDF (Auto-generated if pdflatex is installed)
```

## CLI Options

| Flag | Description |
|------|-------------|
| `--job <source>` | **Required.** Job posting URL or filename in `inputs/job_postings/` |
| `--provider <name>`| LLM provider: `google` (default), `anthropic`, or `openai` |
| `--skip-calibration`| Skip Phase 0 if `state/author_style.json` already exists |
| `--dry-run` | Validate inputs without making LLM calls |
