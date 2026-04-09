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

const STYLE_SYSTEM_PROMPT = `You are an expert linguistic profiler. Your sole task is to extract the writing fingerprint of a specific person from their samples — not to evaluate, summarize, or improve them.

You are profiling HOW this person writes, not WHAT they write about.

HANDLING MULTIPLE SAMPLES:
- Patterns that appear consistently across 2+ samples are reliable signals — weight them heavily.
- Patterns that appear in only one sample are weak signals — note them but do not over-index.
- When samples conflict, report what is most consistent across the majority.

VOICE PROFILE — extract each dimension with precision:

tone:
Describe the emotional register specifically. Not just "professional" — be precise: e.g., "Direct and self-assured without being boastful; warm but not effusive; states achievements as facts rather than celebrating them". Include what the tone is NOT as well as what it is.

sentence_structure:
Describe actual sentence construction with concrete observations. E.g., "Opens most paragraphs with a context-setting clause before the main point", "Uses compound sentences joined by semicolons for related ideas", "Mixes long analytical sentences with short punchy conclusions", "Rarely uses passive voice".

vocabulary_level:
Be specific about register and word choice patterns. E.g., "Prefers precise technical terms over vague abstractions", "Uses Anglo-Saxon words over Latinate synonyms — 'use' not 'utilise', 'show' not 'demonstrate'", "Comfortable with domain-specific jargon but never uses corporate buzzwords".

formatting_quirks:
Concrete, observable patterns only — not impressions. E.g., "Never uses exclamation marks", "Uses em-dashes for asides rather than parentheses", "Paragraphs are consistently 2-3 sentences", "Does not use bullet points in cover letters", "Never opens a cover letter with 'I am writing to apply'", "Signs off with first name only".

common_transitions:
Extract actual phrases from the text — do not invent. List 3-8 transition phrases the author genuinely uses. E.g., ["In my previous role at", "What drew me to", "Building on this", "This experience showed me that"].

forbidden_words:
A single definitive list of words and phrases to never use in this person's voice. Include:
1. Words demonstrably absent from their writing despite obvious opportunities to use them (e.g., they describe leading teams but never use "leadership" as a noun)
2. Common AI-generated filler that conflicts with their style
Examples to check against: ["leverage", "delve", "tapestry", "testament to", "I am passionate about", "utilize", "synergize", "impactful", "innovative", "dynamic", "results-driven"]
Only include words you have evidence to exclude — do not pad this list with guesses.

RESUME STRUCTURE PREFERENCES:

bullet_style:
The exact construction pattern with an example. E.g., "Past-tense action verb + specific task + quantified outcome: 'Reduced API latency by 40% by refactoring the caching layer'". Or: "Metric-first: '40% reduction in API latency — refactored caching layer'".

section_ordering:
The exact sequence as an ordered list. If undeterminable from samples, use: ["Summary", "Experience", "Education", "Skills"].

metric_usage:
How numbers and results appear. E.g., "Always leads with the metric before the action", "Uses percentages for improvements, absolute numbers for scale", "Presents ranges when exact figures are unavailable".

density:
How much information per entry. E.g., "3-4 bullets per role, each one line maximum", "Prioritises impact bullets over responsibility bullets", "Omits roles older than 10 years".`;

const PROFILE_SYSTEM_PROMPT = `You are a professional data extractor. Your task is to build a complete, accurate professional profile from the provided documents. Extract only what is explicitly stated — do not infer, embellish, or fabricate.

HANDLING MULTIPLE DOCUMENTS:
- If multiple resumes are provided, treat them as a timeline. When details conflict, use the most recent version (e.g., updated job titles, current location, revised bullet points).
- For the same role appearing across multiple documents: combine all unique bullets, deduplicate identical ones, and use the most complete version of any shared bullet.
- Skills: if the same skill appears multiple times, list it exactly once.

EXTRACTION RULES:

name: Extract from headers, signatures, or self-references. Use full name as written.

email / phone / location / linkedin: Extract exact values as written. Use "" if not present — do not guess or construct these.

summary: Write 1-2 sentences synthesizing how the person describes themselves professionally. Use their language and framing. Do not write a generic summary — only synthesise from what they explicitly say about themselves.

skills: List every technical skill, tool, language, framework, methodology, and certification mentioned. Each item must be a specific, searchable term — "Python" not "programming languages", "AWS S3" not "cloud storage", "Agile/Scrum" not "project management methodologies". Deduplicate.

experience: For each distinct role:
- title and company: exactly as written
- location: exactly as written, "" if absent
- start_date / end_date: use "YYYY-MM" format. If only a year is given, use "YYYY-01". Use "present" for current roles. If no date information exists, use "".
- bullets: List all unique bullets for this role across all documents. Prioritise bullets with quantified outcomes (numbers, percentages, scale, timeframes) — list these first. Do not paraphrase or merge bullets — preserve the original language.

education: Extract degree (full name as written), school (full name), and graduation year as an integer. If year is approximate, use your best extraction.

DO NOT:
- Fabricate any date, metric, skill, company, or detail not present in the documents
- Write a generic summary — only synthesise from the person's own words
- Add skills that are implied but not explicitly mentioned
- Merge or paraphrase bullets — preserve original language`;

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
