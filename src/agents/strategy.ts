import fs from "node:fs";
import path from "node:path";
import { callLLM } from "../utils/llm.js";
import { TailoringStrategySchema, type TailoringStrategy } from "../schemas.js";
import type { JobContext } from "../schemas.js";
import type { AuthorStyle } from "../schemas.js";
import type { UserProfile } from "../schemas.js";

const SYSTEM_PROMPT = `You are an elite career strategist who specializes in matching candidates to specific job openings.

You will receive three inputs:
1. A structured job context (requirements, culture, skills)
2. The applicant's profile (experience, skills, education)
3. The applicant's writing style preferences

Your task is to build a TAILORING STRATEGY — a concrete plan for how to position this specific applicant for this specific role.

Think like a top recruiting consultant:

**Positioning Angle:** What's the ONE compelling narrative? Don't try to be everything. Pick the strongest angle.

**Experiences to Emphasize:** Which past roles matter most? For each, explain WHY and which specific bullets to highlight. Order by relevance to the target role, not chronologically.

**Skills to Highlight:** Which of the applicant's existing skills directly match the job requirements? Only list real matches.

**Skills Gap Strategy:** Be honest about gaps. For each missing skill, suggest how to reframe it positively. NEVER fabricate experience.

**Cover Letter Hooks:** Give 2-3 specific opening angles that would grab the hiring manager. These should reference real things about the company + real things about the applicant.

**Resume Summary Angle:** How should the 2-line resume summary be slanted for this role?

CRITICAL: Never invent experience or skills the applicant doesn't have. Always work with what's real.`;

/**
 * Phase 2 — Strategy
 *
 * Combines job context, user profile, and author style to produce
 * a tailoring strategy for the application.
 */
export async function runStrategy(
  jobContext: JobContext,
  profile: UserProfile,
  authorStyle: AuthorStyle,
  stateDir: string
): Promise<TailoringStrategy> {
  console.log("\n🎯 Phase 2: Strategy — Building tailoring plan...\n");

  const userContent = `
## Job Context
${JSON.stringify(jobContext, null, 2)}

## Applicant Profile
${JSON.stringify(profile, null, 2)}

## Applicant Writing Style
${JSON.stringify(authorStyle, null, 2)}
`;

  console.log(`  🤖 Generating tailoring strategy...`);

  const strategy = await callLLM({
    systemPrompt: SYSTEM_PROMPT,
    userContent,
    schema: TailoringStrategySchema,
    schemaName: "TailoringStrategy",
    schemaDescription:
      "A detailed plan for how to tailor the applicant's resume and cover letter for a specific job",
    model: "strong",
  });

  // Save to state directory
  const outputPath = path.join(stateDir, "tailoring_strategy.json");
  fs.mkdirSync(stateDir, { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(strategy, null, 2));
  console.log(`  ✅ Strategy saved → ${outputPath}`);

  return strategy;
}
