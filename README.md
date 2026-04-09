# AI Apply

A CLI tool that generates tailored resumes and cover letters using a 4-phase AI pipeline. Give it a job posting and your past documents — it writes in your voice, not AI voice.

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

Phases 0, 0b, and 1 run in parallel. Each output lands in `outputs/{company}_{role}/` so runs never overwrite each other.

---

## Option A — Docker (recommended, no setup needed)

### Prerequisites
- [Docker Desktop](https://www.docker.com/products/docker-desktop/)
- An API key from one of the supported providers (see [API Keys](#api-keys))

### 1. Clone and build

```bash
git clone https://github.com/ronnymtenga/aiApply.git
cd aiApply
docker build -t ai-apply .
```

> First build takes 10-15 minutes (installs pdflatex). Subsequent builds are fast.

### 2. Add your API key

```bash
cp .env.example .env
# Open .env and uncomment your key, e.g.:
# GOOGLE_GENERATIVE_AI_API_KEY=AIza...
```

### 3. Add your input files

```
inputs/
├── resumes/          ← Drop your past resumes here (PDF or Markdown)
├── cover_letters/    ← Drop your past cover letters here (PDF or Markdown)
├── templates/        ← (Optional) LaTeX resume template with {{PLACEHOLDERS}}
└── job_postings/     ← Job posting text files go here
```

At least one resume is required. Cover letters are optional but improve voice matching.

### 4. Run

**Linux / Mac:**
```bash
./run.sh --job "https://company.com/jobs/role" --provider google
./run.sh --job myjob.txt --provider google --skip-calibration
```

**Windows (PowerShell):**
```powershell
./run.ps1 -job "https://company.com/jobs/role" -provider google
./run.ps1 -job myjob.txt -provider google -skipCalibration
```

> **Note:** LinkedIn blocks scrapers. For LinkedIn jobs, copy the job description text into a `.txt` file in `inputs/job_postings/` and pass the filename instead of the URL.

### 5. Get your outputs

```
outputs/{company}_{role}/
├── cover_letter.md    ← Tailored cover letter
├── resume.md          ← Tailored resume (Markdown)
├── resume.tex         ← Tailored resume (LaTeX, if template provided)
└── resume.pdf         ← Compiled PDF (if pdflatex compiled successfully)
```

---

## Option B — Run locally (Node.js)

```bash
npm install
cp .env.example .env   # add your API key
npm run dev -- --job "https://..." --provider google
```

Optional: install `pdflatex` for automatic PDF compilation.
- **Arch:** `sudo pacman -S texlive-basic texlive-latexextra texlive-fontsrecommended`
- **Ubuntu:** `sudo apt install texlive-latex-base texlive-fonts-recommended`

---

## API Keys

Only one key is needed. Pick a provider:

| Provider | Environment Variable | Where to get it | Cost |
|----------|---------------------|-----------------|------|
| Google Gemini | `GOOGLE_GENERATIVE_AI_API_KEY` | [aistudio.google.com](https://aistudio.google.com) | Free tier available |
| Anthropic Claude | `ANTHROPIC_API_KEY` | [console.anthropic.com](https://console.anthropic.com) | Pay per use |
| OpenAI | `OPENAI_API_KEY` | [platform.openai.com](https://platform.openai.com) | Pay per use |

---

## CLI Options

| Flag | Description |
|------|-------------|
| `--job <source>` | **Required.** Job posting URL or filename in `inputs/job_postings/` |
| `--provider <name>` | LLM provider: `anthropic` (default), `google`, or `openai` |
| `--skip-calibration` | Reuse cached `state/author_style.json` — saves time when applying to multiple jobs |
| `--dry-run` | Validate all inputs without making LLM calls |

---

## LaTeX Templates

Drop a `resume.tex` into `inputs/templates/` with placeholders like `{{SUMMARY}}`, `{{EXPERIENCE}}`, `{{SKILLS}}`. The pipeline will inject tailored LaTeX into each placeholder and compile to PDF automatically.

---

## Applying to Multiple Jobs

The `--skip-calibration` flag skips re-analyzing your writing samples on every run. After the first run, use it to save time:

```bash
./run.sh --job job1.txt --provider google
./run.sh --job job2.txt --provider google --skip-calibration
./run.sh --job job3.txt --provider google --skip-calibration
```

Each run saves to its own folder in `outputs/`.
