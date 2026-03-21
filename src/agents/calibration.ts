import fs from "node:fs";
import path from "node:path";
import { PDFParse } from "pdf-parse";
import { callLLM } from "../utils/llm.js";
import {
  AuthorStyleSchema,
  UserProfileSchema,
  type AuthorStyle,
  type UserProfile,
} from "../schemas.js";

const STYLE_SYSTEM_PROMPT = `You are an expert linguistic profiler and writing style analyst.

You will receive one or more writing samples from a job applicant (past cover letters, professional emails, LinkedIn summaries, etc.).

Your task is to EXTRACT the author's unique writing style — NOT to summarize or evaluate the content.

Analyze the following dimensions meticulously:

**Voice Profile:**
- tone: The emotional register (e.g. "confident but not arrogant", "formal yet approachable")
- sentence_structure: How they build sentences. Are they short and punchy? Do they use compound sentences? Do they start with action verbs or context-setting clauses?
- vocabulary_level: Do they use jargon? Simple words? Industry-specific terms? Do they sound like a CEO or an engineer?
- formatting_quirks: Any consistent patterns — bullet usage, paragraph length, dash usage, etc.
- common_transitions: Phrases they use to connect ideas (e.g. "In my previous role", "What drew me to")
- forbidden_words: Words or phrases that are clearly NOT in their style. Also flag common AI words they avoid (e.g. "delve", "tapestry", "testament", "leverage")

**Resume Structure Preferences:**
- bullet_style: How are achievement bullets written? (STAR method? Metric-first? Action-verb-first?)
- section_ordering: What order do they put resume sections in?
- metric_usage: How do they present numbers and results?
- density: Do they prefer brief or detailed entries?

Be extremely precise. This profile will be used to generate new documents in this person's voice.`;

const PROFILE_SYSTEM_PROMPT = `You are an expert data extractor specializing in professional profiles.

You will receive one or more documents from a job applicant — past cover letters, resumes, or professional writing samples.

Your task is to extract ALL factual professional data about the person and assemble it into a structured profile.

Extract the following:
- **name**: The person's full name (from sign-offs, headers, or references)
- **email**: Their email address if mentioned (use "" if not found)
- **phone**: Their phone number if mentioned (use "" if not found)
- **location**: Their city/state/country if mentioned (use "" if not found)
- **linkedin**: Their LinkedIn URL if mentioned (use "" if not found)
- **summary**: A 1-2 sentence professional summary synthesized from the samples
- **skills**: All technical skills, tools, languages, and frameworks mentioned
- **experience**: Every job/role mentioned, with:
  - title, company, location (use "" if unknown)
  - start_date, end_date (use approximate values like "2022-01" if exact dates aren't given; use "present" for current roles)
  - bullets: specific achievements, responsibilities, or projects mentioned for that role
- **education**: Degrees, schools, and graduation years mentioned

CRITICAL RULES:
- Only extract facts explicitly stated or strongly implied in the samples
- Do NOT fabricate data — if something isn't mentioned, use empty strings or omit it
- Combine information across multiple samples if they reference the same role
- For the summary, synthesize from what the person says about themselves, don't invent`;

/**
 * Read and concatenate all golden sample files.
 */
async function loadSamples(samplesDir: string): Promise<{ userContent: string; count: number }> {
  const files = fs
    .readdirSync(samplesDir)
    .filter((f) => !f.startsWith("."));

  if (files.length === 0) {
    throw new Error(
      `No documents found in ${samplesDir}.`
    );
  }

  const samples: string[] = [];
  for (const file of files) {
    const filePath = path.join(samplesDir, file);
    let content: string;

    if (file.toLowerCase().endsWith(".pdf")) {
      const buffer = fs.readFileSync(filePath);
      const parser = new PDFParse({ data: new Uint8Array(buffer) });
      const result = await parser.getText();
      content = result.text;
      await parser.destroy();
    } else {
      content = fs.readFileSync(filePath, "utf-8");
    }

    samples.push(`--- Sample: ${file} ---\n${content}`);
    console.log(`  📄 Loaded sample: ${file}`);
  }

  return { userContent: samples.join("\n\n"), count: files.length };
}

/**
 * Phase 0a — Calibration (Style)
 *
 * Reads all files in the golden_samples directory, sends them to the LLM,
 * and extracts a structured AuthorStyle JSON.
 */
export async function runCalibration(
  samplesDir: string,
  stateDir: string
): Promise<AuthorStyle> {
  console.log("\n📐 Phase 0a: Calibration — Extracting your writing voice...\n");

  const { userContent, count } = await loadSamples(samplesDir);

  console.log(`  🤖 Analyzing ${count} sample(s) for writing style...`);

  const authorStyle = await callLLM({
    systemPrompt: STYLE_SYSTEM_PROMPT,
    userContent,
    schema: AuthorStyleSchema,
    schemaName: "AuthorStyle",
    schemaDescription:
      "A detailed profile of the author's writing voice and resume formatting preferences",
    model: "strong",
  });

  // Save to state directory
  const outputPath = path.join(stateDir, "author_style.json");
  fs.mkdirSync(stateDir, { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(authorStyle, null, 2));
  console.log(`  ✅ Author style saved → ${outputPath}`);

  return authorStyle;
}

/**
 * Phase 0b — Profile Extraction
 *
 * Reads all files in the golden_samples directory, sends them to the LLM,
 * and extracts a structured UserProfile JSON containing professional data.
 * Saves the result to inputs/profile.json so the user can review and edit.
 */
export async function runProfileExtraction(
  samplesDir: string,
  profileOutputPath: string,
  stateDir: string
): Promise<UserProfile> {
  console.log("\n👤 Phase 0b: Profile Extraction — Building your profile from samples...\n");

  const { userContent, count } = await loadSamples(samplesDir);

  console.log(`  🤖 Extracting professional data from ${count} sample(s)...`);

  const profile = await callLLM({
    systemPrompt: PROFILE_SYSTEM_PROMPT,
    userContent,
    schema: UserProfileSchema,
    schemaName: "UserProfile",
    schemaDescription:
      "The applicant's professional profile extracted from their writing samples",
    model: "strong",
  });

  // Save to inputs/ so the user can review and edit
  fs.mkdirSync(path.dirname(profileOutputPath), { recursive: true });
  fs.writeFileSync(profileOutputPath, JSON.stringify(profile, null, 2));
  console.log(`  ✅ Profile extracted → ${profileOutputPath}`);
  console.log(`     ℹ️  Review and edit this file to fix any inaccuracies.`);

  // Also save a copy to state/ for debugging
  const stateCopy = path.join(stateDir, "extracted_profile.json");
  fs.mkdirSync(stateDir, { recursive: true });
  fs.writeFileSync(stateCopy, JSON.stringify(profile, null, 2));

  return profile;
}
