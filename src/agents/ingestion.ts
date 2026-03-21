import fs from "node:fs";
import path from "node:path";
import { callLLM } from "../utils/llm.js";
import { JobContextSchema, type JobContext } from "../schemas.js";

const SYSTEM_PROMPT = `You are an expert job posting analyst.

You will receive the raw text of a job posting. Your task is to extract ALL relevant information into a structured format that will be used by downstream agents to tailor a resume and cover letter.

Be thorough and precise:
- Extract the exact job title, company name, and location
- Identify the team or department
- List ALL key responsibilities mentioned
- Separate hard requirements from nice-to-have skills
- Infer cultural values and signals from the language used (e.g., "fast-paced" = values speed, "collaborative" = values teamwork)
- Determine the seniority level from context clues

Do NOT add information that isn't in the posting. Do NOT make assumptions about the company beyond what the text says.`;

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

  const jobText = fs.readFileSync(jobFile, "utf-8");
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
