import fs from "node:fs";
import path from "node:path";
import { callLLM } from "../utils/llm.js";
import { z } from "zod";
import { GenerationOutputSchema, type GenerationOutput } from "../schemas.js";
import type { TailoringStrategy } from "../schemas.js";
import type { AuthorStyle } from "../schemas.js";
import type { UserProfile } from "../schemas.js";
import type { JobContext } from "../schemas.js";

const SYSTEM_PROMPT = `You are a professional ghostwriter specialising in job application documents. You will receive a tailoring strategy, writing voice profile, applicant profile, and job context. Produce two documents.

═══════════════════════════════════════════
COVER LETTER
═══════════════════════════════════════════

STRUCTURE — follow this paragraph order exactly:

1. OPENING (1 paragraph)
   Use one of the cover_letter_hooks from the strategy. Begin with the hook directly.
   Never open with: "I am writing to apply for", "I am excited about", "I would like to express my interest", or any variation of these.

2. WHY THIS COMPANY (1 paragraph)
   Why this specific company, not just the role. Reference something concrete from the job context — a specific product, stated challenge, culture signal, or mission. Generic enthusiasm is not acceptable here.

3. WHAT YOU BRING (1-2 paragraphs)
   The applicant's most relevant experience connected directly to the role's requirements. Use specific examples with metrics where available. Do not list skills — illustrate them through outcomes and named situations. "I led a team of 6 engineers to deliver X" not "I have strong leadership skills".

4. CLOSING (1 paragraph)
   Forward-looking and confident. Express readiness for next steps.
   Never use: "I would be thrilled", "I hope to hear from you soon", "Thank you for your consideration", "I look forward to the opportunity to".

5. SIGN-OFF
   Use the closing style from the author's voice profile. If not determinable, use "Best regards,". Sign with the applicant's full name.

VOICE RULES — non-negotiable:
- Match the tone, sentence structure, vocabulary, and transition phrases from the voice profile exactly
- Check every sentence against the forbidden_words list — remove any violation
- Vary sentence length: mix short declarative sentences with longer compound ones
- Use specific details, never generic claims
- Never use bullet points in a cover letter
- Target 280-350 words total

ADDRESSING:
- If the job context contains a hiring manager's name, address them: "Dear [Name],"
- Otherwise: "Dear Hiring Manager,"

═══════════════════════════════════════════
RESUME CONTENT
═══════════════════════════════════════════

STRUCTURE: Follow the section_ordering from resume_structure_preferences exactly.

SUMMARY (2 sentences):
- Apply the resume_summary_angle from the strategy as your framing lens
- Write in omitted-subject style — no "I" — e.g., "Senior backend engineer with 8 years..."
- The second sentence should name a specific differentiator relevant to this role

EXPERIENCE:
- Include only roles listed in experiences_to_emphasize from the strategy — no others
- For each bullet: rewrite to connect to the target role's requirements, while preserving all metrics exactly as they appear in the original profile
- ATS optimisation: where natural, use the exact phrasing of required_skills from the job context (e.g., if the job says "Kubernetes", use "Kubernetes" — not "container orchestration")
- Lead each bullet with a strong past-tense action verb
- Do not add, invent, or inflate any metric or achievement

SKILLS:
- List skills_to_highlight from the strategy, plus any required_skills from the job that the applicant genuinely has
- Group by category when there are more than 8 items (e.g., Languages, Frameworks, Tools, Platforms)

EDUCATION: Include exactly as in the applicant's profile. No modifications.

LENGTH:
- Under 7 years of experience: target 1 page
- 7+ years: up to 2 pages is acceptable

ABSOLUTE RULES:
- Never fabricate achievements, metrics, companies, dates, or skills
- Never use any word from the forbidden_words list
- Every claim must be traceable to the applicant's profile
- Metrics from the profile must appear verbatim — never round, inflate, or reframe numbers`;

/**
 * Phase 3 — Generation
 *
 * Uses the tailoring strategy and author style to generate
 * the final cover letter and resume.
 */
export async function runGeneration(
  strategy: TailoringStrategy,
  authorStyle: AuthorStyle,
  profile: UserProfile,
  jobContext: JobContext,
  outputDir: string,
  resumeTemplatePath?: string
): Promise<GenerationOutput> {
  console.log("\n✍️  Phase 3: Generation — Writing your documents...\n");

  let dynamicSystemPrompt = SYSTEM_PROMPT;
  let templateContext = "";
  let dynamicSchema: any = GenerationOutputSchema;

  if (resumeTemplatePath) {
    dynamicSystemPrompt += `
    
## LaTeX Template Injection (CRITICAL REQUIREMENT)
The user has provided a LaTeX template. You MUST also populate the \`template_variables\` object in your JSON output.
Find every placeholder like {{SOME_VARIABLE}} in the raw template. Create a key in \`template_variables\` named exactly "SOME_VARIABLE" (without the brackets), and set its value to the pure LaTeX code to be injected.
CRITICAL: Because you are writing LaTeX inside a JSON string, you MUST double-escape all backslashes! For example, write \\\\textbf instead of \\textbf, and \\\\begin instead of \\begin. Never omit this if the template is provided!
CRITICAL LENGTH CONSTRAINT: The user strictly requires the compiled LaTeX resume to fit entirely on ONE PAGE. You must aggressively condense bullets, strictly select only the most relevant experiences, and limit text overall so it does not spill over to page 2.`;

    const rawTemplate = fs.readFileSync(resumeTemplatePath, "utf-8");
    const matches = rawTemplate.match(/\{\{([^}]+)\}\}/g);
    if (matches) {
      const keys = matches.map(m => m.replace(/[{}]/g, "").trim());
      const shape: Record<string, z.ZodString> = {};
      for (const k of keys) {
        shape[k] = z.string().describe(`Tailored LaTeX code for ${k}`);
      }
      dynamicSchema = GenerationOutputSchema.extend({
        template_variables: z.object(shape).describe("The dynamically required LaTeX variables found in the template.")
      });
    }

    templateContext = `
## LaTeX Template (Option B)
The user has provided a blank LaTeX template. It contains placeholder variables like {{SUMMARY}} or {{EXPERIENCE_1}}.
You MUST output a \`template_variables\` object. The keys must correspond EXACTLY to the variable names inside the brackets (e.g. "SUMMARY"). The values must be the tailored LaTeX code (e.g. "\\\\item Did X resulting in Y") to inject there.

Raw Template:
\`\`\`latex
${rawTemplate}
\`\`\`
`;
  }

  const userContent = `
## Tailoring Strategy
${JSON.stringify(strategy, null, 2)}

## Author Writing Voice
${JSON.stringify(authorStyle, null, 2)}

## Applicant Profile
${JSON.stringify(profile, null, 2)}

## Target Job
${JSON.stringify(jobContext, null, 2)}
${templateContext}
`;

  console.log(`  🤖 Generating cover letter and resume...`);

  const output = await callLLM({
    systemPrompt: dynamicSystemPrompt,
    userContent,
    schema: dynamicSchema,
    schemaName: "GenerationOutput",
    schemaDescription:
      "The final cover letter (Markdown) and resume content (structured Markdown) tailored for the job",
    model: "strong",
  });

  // Save outputs
  fs.mkdirSync(outputDir, { recursive: true });

  const coverLetterPath = path.join(outputDir, "cover_letter.md");
  fs.writeFileSync(coverLetterPath, output.cover_letter);
  console.log(`  ✅ Cover letter saved → ${coverLetterPath}`);

  const resumePath = path.join(outputDir, "resume.md");
  fs.writeFileSync(resumePath, output.resume_content);
  console.log(`  ✅ Resume saved → ${resumePath}`);

  if (resumeTemplatePath && output.template_variables) {
    let finalTex = fs.readFileSync(resumeTemplatePath, "utf-8");
    const injectedKeys: string[] = [];
    for (let [key, value] of Object.entries(output.template_variables)) {
      // Sometimes the LLM ignores instructions and outputs the key with brackets e.g. "{{SUMMARY}}"
      key = key.replace(/[{}]/g, "").trim(); 
      finalTex = finalTex.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), value as string);
      injectedKeys.push(key);
    }
    const texOutputPath = path.join(outputDir, "resume.tex");
    fs.writeFileSync(texOutputPath, finalTex);
    console.log(`  ✅ LaTeX Resume tailored and saved → ${texOutputPath}`);
    console.log(`  🔍 Injected variables: ${injectedKeys.join(", ")}`);
  }

  return output;
}
