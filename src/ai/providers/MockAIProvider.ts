import type {
  AIProvider,
  CodeReviewInput,
  CodeReviewOutput,
  AIFinding,
} from "../AIProvider.interface.js";

/**
 * MockAIProvider — returns deterministic results without any API calls.
 * Used in development, testing, and CI.
 */
export class MockAIProvider implements AIProvider {
  private readonly model = "mock-v1";
  private readonly provider = "mock";

  getProviderName(): string {
    return this.provider;
  }

  getModelName(): string {
    return this.model;
  }

  async reviewCode(input: CodeReviewInput): Promise<CodeReviewOutput> {
    const start = Date.now();

    // Simulate a realistic delay
    await new Promise((resolve) => setTimeout(resolve, 100));

    const findings: AIFinding[] = [];

    // Generate deterministic mock findings based on file names
    for (const file of input.files.slice(0, 3)) {
      if (file.status === "removed") continue;

      if (
        file.filename.includes("auth") ||
        file.filename.includes("login") ||
        file.filename.includes("password")
      ) {
        findings.push({
          severity: "HIGH",
          category: "SECURITY",
          title: "Potential authentication weakness",
          description:
            "This file contains authentication logic. Ensure proper input validation, rate limiting, and secure token handling are in place.",
          filePath: file.filename,
          lineStart: 10,
          lineEnd: 15,
          codeSnippet: "// Mock: authentication code detected",
          suggestion:
            "Review authentication logic for: (1) input validation, (2) brute force protection, (3) secure token storage.",
          confidence: 0.75,
        });
      }

      if (file.filename.endsWith(".ts") || file.filename.endsWith(".js")) {
        if (file.additions > 50) {
          findings.push({
            severity: "MEDIUM",
            category: "CODE_QUALITY",
            title: "Large function or module change",
            description: `This file has ${file.additions} additions. Consider breaking large changes into smaller, more focused units.`,
            filePath: file.filename,
            lineStart: null,
            lineEnd: null,
            codeSnippet: null,
            suggestion:
              "Consider extracting helper functions or splitting this module for better maintainability.",
            confidence: 0.6,
          });
        }
      }

      if (
        file.filename.includes("TODO") ||
        (file.patch?.includes("TODO") ?? false)
      ) {
        findings.push({
          severity: "LOW",
          category: "MAINTAINABILITY",
          title: "TODO comment in production code",
          description:
            "Found TODO comment in the changed code. Unresolved TODOs can indicate incomplete implementation.",
          filePath: file.filename,
          lineStart: null,
          lineEnd: null,
          codeSnippet: null,
          suggestion:
            "Create a tracking issue for this TODO instead of leaving it inline.",
          confidence: 0.9,
        });
      }
    }

    const summary =
      findings.length === 0
        ? `The pull request changes look clean. ${input.files.length} file(s) reviewed with no significant issues found.`
        : `Reviewed ${input.files.length} file(s) in PR #${input.pullRequest.number}. Found ${findings.length} finding(s) that may need attention. See inline comments for details.`;

    return {
      summary,
      findings,
      qualitativeAssessment: findings.length === 0 ? "good" : "fair",
      promptVersion: input.promptVersion,
      model: this.model,
      provider: this.provider,
      inputTokens: Math.floor(Math.random() * 5000) + 1000,
      outputTokens: Math.floor(Math.random() * 1000) + 200,
      durationMs: Date.now() - start,
    };
  }
}
