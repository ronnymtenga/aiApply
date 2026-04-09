#!/usr/bin/env node

import "dotenv/config";
import { Command } from "commander";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { exec } from "node:child_process";
import util from "node:util";

import { runCalibration, runProfileExtraction } from "./agents/calibration.js";
import { runIngestion } from "./agents/ingestion.js";
import { runStrategy } from "./agents/strategy.js";
import { runGeneration } from "./agents/generation.js";
import { UserProfileSchema } from "./schemas.js";
import { isUrl, fetchJobPosting } from "./utils/scraper.js";
import { setProvider, validateApiKey, type Provider } from "./utils/llm.js";

// ─── Resolve project root ───────────────────────────────────────────────────
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, "..");

// ─── Paths ──────────────────────────────────────────────────────────────────
const INPUTS_DIR = path.join(PROJECT_ROOT, "inputs");
const RESUMES_DIR = path.join(INPUTS_DIR, "resumes");
const COVER_LETTERS_DIR = path.join(INPUTS_DIR, "cover_letters");
const JOB_POSTINGS_DIR = path.join(INPUTS_DIR, "job_postings");
const TEMPLATES_DIR = path.join(INPUTS_DIR, "templates");
const PROFILE_FILE = path.join(INPUTS_DIR, "profile.json");
const STATE_DIR = path.join(PROJECT_ROOT, "state");
const OUTPUTS_BASE_DIR = path.join(PROJECT_ROOT, "outputs");

// ─── CLI ────────────────────────────────────────────────────────────────────
const program = new Command();

program
  .name("ai-apply")
  .description(
    "AI-powered job application pipeline — generates tailored resumes and cover letters"
  )
  .version("1.0.0")
  .requiredOption(
    "--job <source>",
    "Job posting URL (https://...) or filename in inputs/job_postings/"
  )
  .option(
    "--skip-calibration",
    "Skip Phase 0 if state/author_style.json already exists",
    false
  )
  .option(
    "--provider <name>",
    "LLM provider: anthropic, google, or openai (default: anthropic)",
    "anthropic"
  )
  .option(
    "--dry-run",
    "Validate inputs and schemas without making LLM calls",
    false
  )
  .parse();

const opts = program.opts<{
  job: string;
  skipCalibration: boolean;
  provider: Provider;
  dryRun: boolean;
}>();

// ─── Helpers ────────────────────────────────────────────────────────────────

function slugify(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

// ─── Main Pipeline ──────────────────────────────────────────────────────────
async function main() {
  const startTime = Date.now();

  console.log("╔══════════════════════════════════════════════╗");
  console.log("║        🚀  AI Apply — Pipeline Runner       ║");
  console.log("╚══════════════════════════════════════════════╝");

  // ── Resolve job posting (URL or local file) ───────────────────────────
  let jobFile: string;

  if (isUrl(opts.job)) {
    // URL provided — fetch it and save locally
    jobFile = await fetchJobPosting(opts.job, JOB_POSTINGS_DIR);
  } else {
    // Filename provided — look in inputs/job_postings/
    jobFile = path.join(JOB_POSTINGS_DIR, opts.job);
    if (!fs.existsSync(jobFile)) {
      console.error(`\n❌ Job posting not found: ${jobFile}`);
      console.error(
        `   Available postings: ${fs.readdirSync(JOB_POSTINGS_DIR).join(", ")}`
      );
      process.exit(1);
    }
  }

  // Check if profile exists — if not, we'll auto-extract it from golden samples
  const profileExists = fs.existsSync(PROFILE_FILE);
  const needsProfileExtraction = !profileExists;

  // Check golden samples
  let resumesCount = 0;
  let coverLettersCount = 0;
  if (fs.existsSync(RESUMES_DIR)) {
    resumesCount = fs.readdirSync(RESUMES_DIR).filter((f) => !f.startsWith(".")).length;
  }
  if (fs.existsSync(COVER_LETTERS_DIR)) {
    coverLettersCount = fs.readdirSync(COVER_LETTERS_DIR).filter((f) => !f.startsWith(".")).length;
  }

  if (!profileExists && resumesCount === 0) {
    console.error(`\n❌ No profile.json and no resumes found in inputs/resumes/.`);
    console.error(`   Either create inputs/profile.json manually,`);
    console.error(`   or drop past resumes into inputs/resumes/`);
    process.exit(1);
  }

  // Load profile if it exists
  let profile;
  if (profileExists) {
    const rawProfile = JSON.parse(fs.readFileSync(PROFILE_FILE, "utf-8"));
    const profileResult = UserProfileSchema.safeParse(rawProfile);
    if (!profileResult.success) {
      console.error(`\n❌ Invalid profile.json:`);
      console.error(profileResult.error.format());
      process.exit(1);
    }
    profile = profileResult.data;
    console.log(`\n✅ Profile loaded: ${profile.name}`);
  } else {
    console.log(`\n📋 No profile.json found — will auto-extract from golden samples`);
  }

  console.log(`✅ Job posting: ${opts.job}`);

  if (opts.dryRun) {
    console.log("\n🔍 Dry-run mode — all inputs validated. No LLM calls made.");
    if (needsProfileExtraction) {
      console.log("   ℹ️  Profile will be auto-extracted from golden samples on a real run.");
    }
    console.log("   To run for real, remove the --dry-run flag.");
    process.exit(0);
  }

  // ── Set LLM provider and validate API key ────────────────────────────
  const validProviders: Provider[] = ["anthropic", "google", "openai"];
  if (!validProviders.includes(opts.provider)) {
    console.error(`\n❌ Invalid provider: ${opts.provider}`);
    console.error(`   Valid options: ${validProviders.join(", ")}`);
    process.exit(1);
  }
  setProvider(opts.provider);
  console.log(`✅ LLM provider: ${opts.provider}`);

  try {
    validateApiKey(opts.provider);
  } catch (err) {
    console.error((err as Error).message);
    process.exit(1);
  }

  // Ensure state directory exists
  fs.mkdirSync(STATE_DIR, { recursive: true });

  // ── Phases 0a, 0b, 1 — run in parallel (all independent) ─────────────
  console.log("\n⚡ Running phases 0a, 0b, and 1 in parallel...");

  const authorStylePath = path.join(STATE_DIR, "author_style.json");

  const calibrationPromise = (async () => {
    if (opts.skipCalibration && fs.existsSync(authorStylePath)) {
      console.log("\n⏭️  Skipping Phase 0a (using cached author_style.json)");
      return JSON.parse(fs.readFileSync(authorStylePath, "utf-8"));
    } else if (coverLettersCount > 0) {
      return runCalibration(COVER_LETTERS_DIR, STATE_DIR);
    } else {
      console.log("\n📐 Phase 0a: Calibration — No cover letters found. Using default professional style...");
      return {
        voice_profile: {
          tone: "Professional and confident",
          sentence_structure: "Clear, action-oriented sentences",
          vocabulary_level: "Standard professional vocabulary",
          formatting_quirks: "Standard bullet points",
          common_transitions: ["Additionally", "Furthermore"],
          forbidden_words: [],
        },
        resume_structure_preferences: {
          bullet_style: "STAR method, action-verb first",
          section_ordering: ["Summary", "Experience", "Education", "Skills"],
          metric_usage: "Used to quantify achievements",
          density: "Balanced and scannable",
        },
      };
    }
  })();

  const profilePromise = (async () => {
    if (!needsProfileExtraction) return profile!;
    return runProfileExtraction(RESUMES_DIR, PROFILE_FILE, STATE_DIR);
  })();

  const ingestionPromise = runIngestion(jobFile, STATE_DIR);

  const [authorStyle, resolvedProfile, jobContext] = await Promise.all([
    calibrationPromise,
    profilePromise,
    ingestionPromise,
  ]);

  profile = resolvedProfile;
  if (needsProfileExtraction) {
    console.log(`  ✅ Profile auto-extracted: ${profile.name}`);
  }

  // ── Create per-job output directory ──────────────────────────────────
  const jobSlug = slugify(`${jobContext.company_name}_${jobContext.job_title}`);
  const OUTPUTS_DIR = path.join(OUTPUTS_BASE_DIR, jobSlug);
  fs.mkdirSync(OUTPUTS_DIR, { recursive: true });
  console.log(`\n📂 Output directory: outputs/${jobSlug}/`);

  // ── Phase 2: Strategy ─────────────────────────────────────────────────
  const strategy = await runStrategy(
    jobContext,
    profile!,
    authorStyle,
    STATE_DIR
  );

  const resumeTemplatePath = path.join(TEMPLATES_DIR, "resume.tex");
  const hasTemplate = fs.existsSync(resumeTemplatePath);

  // ── Phase 3: Generation ───────────────────────────────────────────────
  await runGeneration(
    strategy,
    authorStyle,
    profile!,
    jobContext,
    OUTPUTS_DIR,
    hasTemplate ? resumeTemplatePath : undefined
  );

  // ── Done ──────────────────────────────────────────────────────────────
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  if (hasTemplate && fs.existsSync(path.join(OUTPUTS_DIR, "resume.tex"))) {
    console.log(`\n📄 Attempting to compile LaTeX to PDF...`);
    const execAsync = util.promisify(exec);
    try {
      await execAsync(`pdflatex -interaction=nonstopmode -output-directory=${OUTPUTS_DIR} ${path.join(OUTPUTS_DIR, "resume.tex")}`);
      console.log(`  ✅ Successfully compiled → outputs/${jobSlug}/resume.pdf`);

      const auxExts = [".aux", ".log", ".out"];
      for (const ext of auxExts) {
        const auxFile = path.join(OUTPUTS_DIR, `resume${ext}`);
        if (fs.existsSync(auxFile)) fs.unlinkSync(auxFile);
      }
    } catch (err: any) {
      console.log(`  ⚠️  LaTeX compile failed. You may need to compile outputs/${jobSlug}/resume.tex manually.`);
      if (err.stderr) console.error(`     pdflatex stderr:\n${err.stderr}`);
      else if (err.message) console.error(`     Error: ${err.message}`);
    }
  }

  console.log("\n╔══════════════════════════════════════════════╗");
  console.log("║          ✅  Pipeline Complete!              ║");
  console.log("╚══════════════════════════════════════════════╝");
  console.log(`\n  ⏱️  Total time: ${elapsed}s`);
  console.log(`  📂 Outputs:`);
  console.log(`     → outputs/${jobSlug}/cover_letter.md`);
  console.log(`     → outputs/${jobSlug}/resume.md`);
  console.log(`  📂 State (debug):`);
  console.log(`     → state/author_style.json`);
  console.log(`     → state/job_context.json`);
  console.log(`     → state/tailoring_strategy.json\n`);
}

main().catch((err) => {
  console.error("\n💥 Pipeline failed:\n");
  console.error(err);
  process.exit(1);
});
