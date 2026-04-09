import fs from "node:fs";
import path from "node:path";
import { PDFParse } from "pdf-parse";
import { callLLM } from "../utils/llm.js";
import { JobContextSchema, type JobContext } from "../schemas.js";

const SYSTEM_PROMPT = `You are a job posting analyst. Extract every relevant signal from this posting into a structured format that downstream agents will use to tailor a resume and cover letter.

EXTRACTION RULES:

job_title: The exact title as written — do not paraphrase or normalise.

company_name: Exact company name as written.

company_description: 2-3 sentences maximum. Cover: what the company does, its scale or stage if mentioned, and its stated mission or value proposition. Use only information from the posting — do not add external knowledge about the company.

location: The full location string exactly as stated. Include work arrangement in the same field, e.g. "Munich, Germany (Hybrid — 2 days/week in office)" or "Remote (US timezones only)".

remote_policy: Extract work arrangement as one of: "Remote", "Hybrid", "On-site", or "Not specified". Derive from location or any explicit statement in the posting.

salary_range: The compensation range exactly as stated (e.g. "€60,000–€75,000", "$120k–$150k + equity"). Use "Not specified" if absent.

team_or_department: The specific team, department, or product area. Use "Not specified" if absent.

key_responsibilities: Extract each distinct responsibility as a separate item. Do not summarise or merge related responsibilities into one bullet — if the posting lists them separately, you list them separately. Use the posting's language, not your own paraphrase.

required_skills: Skills, technologies, qualifications, or experience the posting marks as required, essential, mandatory, or must-have. Use the exact terminology from the posting (e.g. "Kubernetes" not "container orchestration") — exact phrasing matters for ATS matching. If a skill appears in both required and preferred sections, include it in required_skills only.

preferred_skills: Skills listed as preferred, nice-to-have, a plus, or "experience with X is beneficial". Exclude anything already captured in required_skills.

culture_signals: Specific language from the posting that reveals working style, values, or culture. Quote or closely paraphrase — do not substitute generic inferences. E.g., "posting uses 'we move fast and break things'", "repeats 'ownership' and 'autonomy' across three sections", "explicitly lists 'no ego' as a team value".

seniority_level: State the level and your reasoning. E.g., "Senior — job title includes 'Senior', requires 5+ years of experience, and mentions leading cross-functional projects". If ambiguous, state all signals and your conclusion.`;

/**
 * Phase 1 — Ingestion
 *
 * Reads a job posting file, sends it to the LLM, and extracts
 * structured job context data.
 */
export async function runIngestion(
  jobFile: string,
  stateDir: string
): Promise<JobContext> {
  console.log("\n📥 Phase 1: Ingestion — Parsing job description...\n");

  if (!fs.existsSync(jobFile)) {
    throw new Error(`Job posting file not found: ${jobFile}`);
  }

  let jobText: string;
  if (jobFile.toLowerCase().endsWith(".pdf")) {
    const buffer = fs.readFileSync(jobFile);
    const parser = new PDFParse({ data: new Uint8Array(buffer) });
    const result = await parser.getText();
    jobText = result.text;
    await parser.destroy();
  } else {
    jobText = fs.readFileSync(jobFile, "utf-8");
  }
  console.log(`  📄 Loaded job posting: ${path.basename(jobFile)}`);
  console.log(`  🤖 Extracting structured job context...`);

  const jobContext = await callLLM({
    systemPrompt: SYSTEM_PROMPT,
    userContent: jobText,
    schema: JobContextSchema,
    schemaName: "JobContext",
    schemaDescription:
      "Structured extraction of a job posting's requirements, skills, culture, and metadata",
    model: "fast",
  });

  // Save to state directory
  const outputPath = path.join(stateDir, "job_context.json");
  fs.mkdirSync(stateDir, { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(jobContext, null, 2));
  console.log(`  ✅ Job context saved → ${outputPath}`);

  return jobContext;
}
