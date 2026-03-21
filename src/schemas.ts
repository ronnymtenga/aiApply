import { z } from "zod";

// ─── Phase 0 Output: Author Style ───────────────────────────────────────────

export const VoiceProfileSchema = z.object({
  tone: z
    .string()
    .describe(
      "The overall tone of the author's writing (e.g. 'Direct, confident, slightly informal but professional')"
    ),
  sentence_structure: z
    .string()
    .describe(
      "How the author constructs sentences (e.g. 'Short punchy paragraphs, starts with action verbs')"
    ),
  vocabulary_level: z
    .string()
    .describe(
      "The level of vocabulary and jargon usage (e.g. 'Professional, avoids corporate buzzwords')"
    ),
  formatting_quirks: z
    .string()
    .describe(
      "Any formatting habits or patterns (e.g. 'Uses bullet points, avoids exclamation marks')"
    ),
  common_transitions: z
    .array(z.string())
    .describe(
      "Transition words or phrases the author frequently uses"
    ),
  forbidden_words: z
    .array(z.string())
    .describe(
      "Words or phrases the author never uses or should be avoided to maintain authenticity"
    ),
});

export const ResumeStructureSchema = z.object({
  bullet_style: z
    .string()
    .describe(
      "How resume bullets are structured (e.g. 'STAR method, 1-2 lines each')"
    ),
  section_ordering: z
    .array(z.string())
    .describe(
      "Preferred order of resume sections (e.g. ['Summary', 'Experience', 'Skills', 'Education'])"
    ),
  metric_usage: z
    .string()
    .describe(
      "How the author uses metrics and numbers (e.g. 'Leads with the metric')"
    ),
  density: z
    .string()
    .describe(
      "Preferred information density (e.g. 'High density, prefers technical exactness')"
    ),
});

export const AuthorStyleSchema = z.object({
  voice_profile: VoiceProfileSchema,
  resume_structure_preferences: ResumeStructureSchema,
});

export type AuthorStyle = z.infer<typeof AuthorStyleSchema>;

// ─── Phase 1 Output: Job Context ────────────────────────────────────────────

export const JobContextSchema = z.object({
  job_title: z.string().describe("The title of the job position"),
  company_name: z.string().describe("The name of the hiring company"),
  company_description: z
    .string()
    .describe("A brief summary of what the company does and its culture"),
  location: z.string().describe("Job location (e.g. 'San Francisco, CA (Hybrid)')"),
  team_or_department: z
    .string()
    .describe("The team or department the role is in"),
  key_responsibilities: z
    .array(z.string())
    .describe("The main responsibilities listed in the posting"),
  required_skills: z
    .array(z.string())
    .describe("Hard skills and technologies explicitly required"),
  preferred_skills: z
    .array(z.string())
    .describe("Nice-to-have skills or experience"),
  culture_signals: z
    .array(z.string())
    .describe(
      "Inferred cultural values from the posting (e.g. 'values collaboration', 'ships fast')"
    ),
  seniority_level: z
    .string()
    .describe("The seniority level (e.g. 'Senior', 'Mid-level', 'Lead')"),
});

export type JobContext = z.infer<typeof JobContextSchema>;

// ─── Phase 2 Output: Tailoring Strategy ─────────────────────────────────────

export const TailoringStrategySchema = z.object({
  positioning_angle: z
    .string()
    .describe(
      "The core narrative angle for this application (e.g. 'Position as a developer-tools specialist with payment systems experience')"
    ),
  experiences_to_emphasize: z
    .array(
      z.object({
        company: z.string(),
        title: z.string(),
        reason: z
          .string()
          .describe("Why this experience is relevant to the target role"),
        bullets_to_highlight: z
          .array(z.string())
          .describe("Specific achievements to feature prominently"),
      })
    )
    .describe("Past roles to emphasize, in order of relevance"),
  skills_to_highlight: z
    .array(z.string())
    .describe(
      "Skills from the user's profile that directly match job requirements"
    ),
  skills_gap_strategy: z
    .array(
      z.object({
        missing_skill: z.string(),
        mitigation: z
          .string()
          .describe(
            "How to frame this gap positively (e.g. 'Position Python experience as transferable to Go')"
          ),
      })
    )
    .describe("How to handle skills the job requires that the user lacks"),
  cover_letter_hooks: z
    .array(z.string())
    .describe(
      "2–3 compelling opening angles for the cover letter"
    ),
  resume_summary_angle: z
    .string()
    .describe(
      "How the resume summary should be framed for this specific role"
    ),
});

export type TailoringStrategy = z.infer<typeof TailoringStrategySchema>;

// ─── Phase 3 Output: Generated Documents ────────────────────────────────────

export const GenerationOutputSchema = z.object({
  cover_letter: z
    .string()
    .describe(
      "The full cover letter in Markdown format, written in the author's voice"
    ),
  resume_content: z
    .string()
    .describe(
      "The full resume content in structured Markdown, tailored for the target role"
    ),
  template_variables: z
    .record(z.string())
    .optional()
    .describe(
      "If a LaTeX template is provided, an object mapping exact variable names (e.g. 'SUMMARY') to their tailored LaTeX block."
    ),
});

export type GenerationOutput = z.infer<typeof GenerationOutputSchema>;

// ─── User Profile (input) ───────────────────────────────────────────────────

export const ExperienceSchema = z.object({
  title: z.string(),
  company: z.string(),
  location: z.string(),
  start_date: z.string(),
  end_date: z.string(),
  bullets: z.array(z.string()),
});

export const EducationSchema = z.object({
  degree: z.string(),
  school: z.string(),
  graduation_year: z.number(),
});

export const UserProfileSchema = z.object({
  name: z.string(),
  email: z.string(),
  phone: z.string().optional(),
  location: z.string().optional(),
  linkedin: z.string().optional(),
  summary: z.string(),
  skills: z.array(z.string()),
  experience: z.array(ExperienceSchema),
  education: z.array(EducationSchema),
});

export type UserProfile = z.infer<typeof UserProfileSchema>;
