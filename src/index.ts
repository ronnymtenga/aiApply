#!/usr/bin/env node

import "dotenv/config";
import { Command } from "commander";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

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
const GOLDEN_SAMPLES_DIR = path.join(INPUTS_DIR, "golden_samples");
const JOB_POSTINGS_DIR = path.join(INPUTS_DIR, "job_postings");
const PROFILE_FILE = path.join(INPUTS_DIR, "profile.json");
const STATE_DIR = path.join(PROJECT_ROOT, "state");
const OUTPUTS_DIR = path.join(PROJECT_ROOT, "outputs");

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
  let needsProfileExtraction = !profileExists;

  // Check golden samples
  const sampleFiles = fs
    .readdirSync(GOLDEN_SAMPLES_DIR)
    .filter((f) => !f.startsWith("."));
  console.log(`✅ Golden samples: ${sampleFiles.length} file(s)`);

  if (!profileExists && sampleFiles.length === 0) {
    console.error(`\n❌ No profile.json and no golden samples found.`);
    console.error(`   Either create inputs/profile.json manually,`);
    console.error(`   or drop past resumes/cover letters into inputs/golden_samples/`);
    process.exit(1);
  }

  // Load profile if it exists; otherwise mark for extraction
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

  // Ensure state and output directories exist
  fs.mkdirSync(STATE_DIR, { recursive: true });
  fs.mkdirSync(OUTPUTS_DIR, { recursive: true });

  // ── Phase 0b: Profile Extraction (if needed) ─────────────────────────
  if (needsProfileExtraction) {
    profile = await runProfileExtraction(
      GOLDEN_SAMPLES_DIR,
      PROFILE_FILE,
      STATE_DIR
    );
    console.log(`  ✅ Profile auto-extracted: ${profile.name}`);
  }

  // ── Phase 0a: Calibration (Style) ─────────────────────────────────────
  let authorStyle;
  const authorStylePath = path.join(STATE_DIR, "author_style.json");

  if (opts.skipCalibration && fs.existsSync(authorStylePath)) {
    console.log("\n⏭️  Skipping Phase 0a (using cached author_style.json)");
    authorStyle = JSON.parse(fs.readFileSync(authorStylePath, "utf-8"));
  } else {
    authorStyle = await runCalibration(GOLDEN_SAMPLES_DIR, STATE_DIR);
  }

  // ── Phase 1: Ingestion ────────────────────────────────────────────────
  const jobContext = await runIngestion(jobFile, STATE_DIR);

  // ── Phase 2: Strategy ─────────────────────────────────────────────────
  // profile is guaranteed to be set — either loaded from file or extracted above
  const strategy = await runStrategy(
    jobContext,
    profile!,
    authorStyle,
    STATE_DIR
  );

  // ── Phase 3: Generation ───────────────────────────────────────────────
  await runGeneration(strategy, authorStyle, profile!, jobContext, OUTPUTS_DIR);

  // ── Done ──────────────────────────────────────────────────────────────
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log("\n╔══════════════════════════════════════════════╗");
  console.log("║          ✅  Pipeline Complete!              ║");
  console.log("╚══════════════════════════════════════════════╝");
  console.log(`\n  ⏱️  Total time: ${elapsed}s`);
  console.log(`  📂 Outputs:`);
  console.log(`     → outputs/cover_letter.md`);
  console.log(`     → outputs/resume.md`);
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
