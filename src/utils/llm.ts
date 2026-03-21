import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { generateObject } from "ai";
import { z } from "zod";

// ─── Provider Types ─────────────────────────────────────────────────────────

export type Provider = "anthropic" | "google" | "openai";

// ─── Model Mapping ──────────────────────────────────────────────────────────

const MODEL_MAP: Record<Provider, { fast: string; strong: string }> = {
  anthropic: {
    fast: "claude-sonnet-4-20250514",
    strong: "claude-sonnet-4-20250514",
  },
  google: {
    fast: "gemini-2.0-flash",
    strong: "gemini-2.5-flash-preview-05-20",
  },
  openai: {
    fast: "gpt-4o-mini",
    strong: "gpt-4o",
  },
};

// ─── API Key Validation ─────────────────────────────────────────────────────

const ENV_KEY_MAP: Record<Provider, string> = {
  anthropic: "ANTHROPIC_API_KEY",
  google: "GOOGLE_GENERATIVE_AI_API_KEY",
  openai: "OPENAI_API_KEY",
};

export function getRequiredEnvKey(provider: Provider): string {
  return ENV_KEY_MAP[provider];
}

export function validateApiKey(provider: Provider): void {
  const envVar = ENV_KEY_MAP[provider];
  if (!process.env[envVar]) {
    throw new Error(
      `\n❌ ${envVar} not found in environment.\n` +
        `   Add it to your .env file: ${envVar}=your-key-here\n`
    );
  }
}

// ─── Model Factory ──────────────────────────────────────────────────────────

let activeProvider: Provider = "anthropic";

export function setProvider(provider: Provider): void {
  activeProvider = provider;
}

function getModel(tier: "fast" | "strong") {
  const modelId = MODEL_MAP[activeProvider][tier];

  switch (activeProvider) {
    case "anthropic":
      return createAnthropic()(modelId);
    case "google":
      return createGoogleGenerativeAI()(modelId);
    case "openai":
      return createOpenAI()(modelId);
  }
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Call an LLM and force it to return structured JSON matching a Zod schema.
 * Uses the Vercel AI SDK's `generateObject` under the hood.
 */
export async function callLLM<T extends z.ZodType>(opts: {
  systemPrompt: string;
  userContent: string;
  schema: T;
  schemaName: string;
  schemaDescription: string;
  model?: "fast" | "strong";
}): Promise<z.infer<T>> {
  const { object } = await generateObject({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    model: getModel(opts.model ?? "fast") as any,
    schema: opts.schema,
    schemaName: opts.schemaName,
    schemaDescription: opts.schemaDescription,
    system: opts.systemPrompt,
    prompt: opts.userContent,
  });

  return object;
}
