# ── Stage 1: Build ──────────────────────────────────────────────────────────
FROM node:22-slim AS builder

WORKDIR /app

COPY package*.json tsconfig.json ./
RUN npm ci

COPY src/ ./src/
RUN npm run build

# ── Stage 2: Runtime ────────────────────────────────────────────────────────
FROM node:22-slim AS runtime

# Install pdflatex for optional LaTeX → PDF compilation
RUN apt-get update && apt-get install -y --no-install-recommends \
    texlive-latex-base \
    texlive-latex-extra \
    texlive-fonts-recommended \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Production dependencies only
COPY package*.json ./
RUN npm ci --omit=dev

# Compiled JS from builder stage
COPY --from=builder /app/dist ./dist

# Ensure mount-point directories exist inside the image
RUN mkdir -p inputs/resumes inputs/cover_letters inputs/job_postings inputs/templates outputs state

ENTRYPOINT ["node", "dist/index.js"]
