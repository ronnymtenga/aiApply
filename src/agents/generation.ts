import fs from "node:fs";
import path from "node:path";
import { callLLM } from "../utils/llm.js";
import { z } from "zod";
import { GenerationOutputSchema, type GenerationOutput } from "../schemas.js";
import type { TailoringStrategy } from "../schemas.js";
import type { AuthorStyle } from "../schemas.js";
import type { UserProfile } from "../schemas.js";
import type { JobContext } from "../schemas.js";

const SYSTEM_PROMPT = `You are a world-class professional writer who ghostwrites job application documents.

You will receive:
1. A tailoring strategy (which experiences to emphasize, positioning angle, hooks)
2. The applicant's writing voice profile (tone, sentence structure, vocabulary)
3. The applicant's full profile (experience, skills, education)
4. The job context (company, role, requirements)

Your task is to produce TWO documents:

## Cover Letter (Markdown)
- Write a complete cover letter in the applicant's EXACT writing voice
- Follow the voice_profile precisely: match their tone, sentence structure, vocabulary level
- Use the cover_letter_hooks from the strategy as starting points
- DO NOT use any words from the "forbidden_words" list
- Keep it to 4-5 short paragraphs maximum
- Address it "Dear Hiring Manager" unless a name is known
- Sign with the applicant's name
- Make it feel authentically human—not like AI wrote it

## Resume Content (Structured Markdown)
- Output a complete resume in clean Markdown format
- Follow the resume_structure_preferences from the author style
- Use the section_ordering specified in the style profile
- Write a 2-line summary using the resume_summary_angle from the strategy
- For experience: only include the roles and bullets highlighted in the strategy's experiences_to_emphasize
- For each bullet: rewrite to emphasize relevance to the target role while keeping metrics intact
- Highlight the skills_to_highlight prominently
- Include education

CRITICAL RULES:
- NEVER fabricate achievements, metrics, or experiences
- NEVER use forbidden_words from the voice profile
- The cover letter should read like a real human wrote it, not like AI
- The resume should be scannable and metric-heavy`;

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
