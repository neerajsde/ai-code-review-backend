import type { FindingCategory, FindingSeverity } from "../models/ReviewFinding.model.js";

// ─── AI Provider Interface ────────────────────────────────────────────────────

export interface CodeReviewInput {
  repository: {
    fullName: string;
    owner: string;
    name: string;
    language: string | null;
  };
  pullRequest: {
    number: number;
    title: string;
    description: string | null;
    baseBranch: string;
    headBranch: string;
    author: string;
  };
  files: CodeReviewFile[];
  configuration: {
    enabledCategories: string[];
    reviewStrictness: "strict" | "balanced" | "lenient";
    minimumSeverity: string;
  };
  promptVersion: string;
  chunkInfo?: {
    chunkNumber: number;
    totalChunks: number;
  };
}

export interface CodeReviewFile {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  patch?: string;
}

export interface AIFinding {
  severity: FindingSeverity;
  category: FindingCategory;
  title: string;
  description: string;
  filePath: string;
  lineStart: number | null;
  lineEnd: number | null;
  codeSnippet: string | null;
  suggestion: string | null;
  confidence: number;
}

export interface CodeReviewOutput {
  summary: string;
  findings: AIFinding[];
  // The AI provides qualitative score hint, backend calculates final score
  qualitativeAssessment?: "excellent" | "good" | "fair" | "poor";
  promptVersion: string;
  model: string;
  provider: string;
  inputTokens?: number;
  outputTokens?: number;
  durationMs: number;
}

export interface AIProvider {
  reviewCode(input: CodeReviewInput): Promise<CodeReviewOutput>;
  getProviderName(): string;
  getModelName(): string;
}
