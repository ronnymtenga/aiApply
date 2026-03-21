import fs from "node:fs";
import path from "node:path";

const JINA_READER_PREFIX = "https://r.jina.ai/";

/**
 * Fetch a job posting URL and convert it to clean Markdown text
 * using Jina AI Reader (free, no API key required).
 *
 * The fetched content is saved locally for caching and debugging.
 */
export async function fetchJobPosting(
  url: string,
  jobPostingsDir: string
): Promise<string> {
  console.log(`\n🌐 Fetching job posting from URL...`);
  console.log(`   ${url}\n`);

  const readerUrl = `${JINA_READER_PREFIX}${url}`;

  const response = await fetch(readerUrl, {
    headers: {
      Accept: "text/markdown",
    },
  });

  if (!response.ok) {
    throw new Error(
      `Failed to fetch job posting (HTTP ${response.status}): ${response.statusText}\n` +
        `   URL: ${url}\n` +
        `   If the site blocks scrapers, copy-paste the posting into inputs/job_postings/ instead.`
    );
  }

  const content = await response.text();

  if (!content || content.trim().length < 50) {
    throw new Error(
      `Fetched content is too short or empty — the page may require JavaScript or login.\n` +
        `   Copy-paste the posting into inputs/job_postings/ instead.`
    );
  }

  // Generate a filename from the URL
  const filename = urlToFilename(url);
  const outputPath = path.join(jobPostingsDir, filename);

  fs.mkdirSync(jobPostingsDir, { recursive: true });
  fs.writeFileSync(outputPath, content);

  console.log(`  ✅ Job posting saved → ${outputPath}`);
  console.log(`     (${content.length} characters fetched)\n`);

  return outputPath;
}

/**
 * Detect if a string is a URL.
 */
export function isUrl(input: string): boolean {
  return input.startsWith("http://") || input.startsWith("https://");
}

/**
 * Convert a URL to a safe, readable filename.
 * e.g. "https://boards.greenhouse.io/stripe/jobs/12345" → "stripe_jobs_12345.md"
 */
function urlToFilename(url: string): string {
  try {
    const parsed = new URL(url);

    // Take the hostname + path, strip common prefixes
    let slug = (parsed.hostname + parsed.pathname)
      .replace(/^www\./, "")
      .replace(/\/$/, "");

    // Replace non-alphanumeric chars with underscores
    slug = slug.replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_|_$/g, "");

    // Truncate if too long
    if (slug.length > 80) {
      slug = slug.substring(0, 80);
    }

    return `${slug}.md`;
  } catch {
    // Fallback for malformed URLs
    return `fetched_job_${Date.now()}.md`;
  }
}
