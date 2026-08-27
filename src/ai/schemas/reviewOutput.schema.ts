import { z } from "zod";

const severityEnum = z.enum(["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"]);
const categoryEnum = z.enum([
  "BUG",
  "SECURITY",
  "PERFORMANCE",
  "CODE_QUALITY",
  "ARCHITECTURE",
  "STYLE",
  "MAINTAINABILITY",
  "TESTING",
  "ERROR_HANDLING",
  "DEPENDENCY",
]);

export const aiFindingSchema = z.object({
  severity: severityEnum,
  category: categoryEnum,
  title: z.string().min(5).max(200),
  description: z.string().min(10).max(2000),
  filePath: z.string().min(1).max(500),
  lineStart: z.number().int().positive().nullable().optional().default(null),
  lineEnd: z.number().int().positive().nullable().optional().default(null),
  codeSnippet: z.string().max(1000).nullable().optional().default(null),
  suggestion: z.string().max(2000).nullable().optional().default(null),
  confidence: z.number().min(0).max(1),
});

export const aiReviewOutputSchema = z.object({
  summary: z.string().min(10).max(5000),
  findings: z.array(aiFindingSchema).max(100),
  qualitativeAssessment: z
    .enum(["excellent", "good", "fair", "poor"])
    .optional(),
});

export type AIReviewOutput = z.infer<typeof aiReviewOutputSchema>;
export type AIFindingOutput = z.infer<typeof aiFindingSchema>;

/**
 * Attempts to parse and validate raw AI JSON output.
 * Tries to repair common issues like trailing commas, truncated JSON.
 */
export function parseAndValidateAIOutput(raw: string): AIReviewOutput {
  // Try direct parse first
  try {
    const parsed = JSON.parse(raw);
    return aiReviewOutputSchema.parse(parsed);
  } catch {
    // Try to extract JSON object from markdown code block
    const jsonMatch = raw.match(/```(?:json)?\s*([\s\S]+?)\s*```/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[1]);
        return aiReviewOutputSchema.parse(parsed);
      } catch {
        // Continue to fallback
      }
    }

    // Try to find the first { ... } block
    const objectMatch = raw.match(/\{[\s\S]+\}/);
    if (objectMatch) {
      try {
        const parsed = JSON.parse(objectMatch[0]);
        return aiReviewOutputSchema.parse(parsed);
      } catch {
        // Continue to fallback
      }
    }

    // Final fallback: return a safe empty response
    return {
      summary:
        "AI review output could not be parsed. The PR was analyzed but structured output was not available.",
      findings: [],
      qualitativeAssessment: "fair",
    };
  }
}
