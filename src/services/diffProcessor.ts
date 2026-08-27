import { createHash } from "crypto";
import type { GitHubPRFile } from "../github/github.service.js";
import { ENV } from "../config/env.js";
import logger from "../utils/logger.js";

// ─── File Filtering ───────────────────────────────────────────────────────────

const DEFAULT_IGNORED_PATTERNS = [
  /\.lock$/i,
  /\.min\.(js|css)$/i,
  /\.generated\./i,
  /\.pb\.(go|ts|js)$/i,
  /\.(png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot)$/i,
  /\.(pdf|zip|tar|gz|rar)$/i,
  /package-lock\.json$/,
  /yarn\.lock$/,
  /pnpm-lock\.yaml$/,
  /composer\.lock$/,
  /Gemfile\.lock$/,
];

const DEFAULT_IGNORED_DIRS = [
  "node_modules",
  "dist",
  "build",
  ".next",
  "coverage",
  "vendor",
  ".git",
  "__pycache__",
  ".cache",
];

export interface FilterOptions {
  ignoredFilePatterns?: string[];
  ignoredDirectories?: string[];
  maxFilesPerReview?: number;
  maxFileSizeBytes?: number;
}

export function filterFiles(
  files: GitHubPRFile[],
  options: FilterOptions = {}
): GitHubPRFile[] {
  const {
    ignoredFilePatterns = [],
    ignoredDirectories = DEFAULT_IGNORED_DIRS,
    maxFilesPerReview = ENV.MAX_FILES_PER_REVIEW,
    maxFileSizeBytes = ENV.MAX_FILE_SIZE_BYTES,
  } = options;

  const customPatterns = ignoredFilePatterns.map(
    (p) => new RegExp(p.replace(/\*/g, ".*").replace(/\?/g, "."))
  );

  const filtered = files.filter((file) => {
    // Skip deleted files (no code to review)
    if (file.status === "removed") return false;

    // Skip by directory
    const pathParts = file.filename.split("/");
    if (pathParts.some((part) => ignoredDirectories.includes(part))) {
      return false;
    }

    // Skip by default patterns
    if (DEFAULT_IGNORED_PATTERNS.some((re) => re.test(file.filename))) {
      return false;
    }

    // Skip by custom patterns from config
    if (customPatterns.some((re) => re.test(file.filename))) {
      return false;
    }

    // Skip files with no patch (binary, too large)
    if (!file.patch) return false;

    // Skip oversized files
    const patchSize = Buffer.byteLength(file.patch ?? "", "utf8");
    if (patchSize > maxFileSizeBytes) {
      logger.debug(
        { filename: file.filename, patchSize },
        "Skipping oversized file"
      );
      return false;
    }

    return true;
  });

  // Limit total files
  if (filtered.length > maxFilesPerReview) {
    logger.info(
      { total: filtered.length, limit: maxFilesPerReview },
      "Truncating files to limit"
    );
    return filtered.slice(0, maxFilesPerReview);
  }

  return filtered;
}

// ─── Token Estimation ─────────────────────────────────────────────────────────

/** Rough token estimate: ~4 chars per token */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function estimateFilesTokens(files: GitHubPRFile[]): number {
  return files.reduce((total, f) => {
    return total + estimateTokens(f.patch ?? "") + estimateTokens(f.filename);
  }, 0);
}

// ─── Chunking ─────────────────────────────────────────────────────────────────

export interface ReviewChunk {
  files: GitHubPRFile[];
  chunkNumber: number;
  totalChunks: number;
  estimatedTokens: number;
}

export function chunkFiles(
  files: GitHubPRFile[],
  maxTokensPerChunk = ENV.MAX_REVIEW_TOKENS
): ReviewChunk[] {
  const chunks: GitHubPRFile[][] = [];
  let currentChunk: GitHubPRFile[] = [];
  let currentTokens = 0;

  for (const file of files) {
    const fileTokens = estimateTokens(file.patch ?? "") + estimateTokens(file.filename);

    if (currentTokens + fileTokens > maxTokensPerChunk && currentChunk.length > 0) {
      chunks.push(currentChunk);
      currentChunk = [file];
      currentTokens = fileTokens;
    } else {
      currentChunk.push(file);
      currentTokens += fileTokens;
    }
  }

  if (currentChunk.length > 0) {
    chunks.push(currentChunk);
  }

  if (chunks.length === 0) {
    return [];
  }

  return chunks.map((chunkFiles, idx) => ({
    files: chunkFiles,
    chunkNumber: idx + 1,
    totalChunks: chunks.length,
    estimatedTokens: estimateFilesTokens(chunkFiles),
  }));
}

// ─── Finding Fingerprint ──────────────────────────────────────────────────────

export function generateFindingFingerprint(params: {
  repositoryId: string;
  pullRequestNumber: number;
  filePath: string;
  lineStart: number | null;
  category: string;
  title: string;
}): string {
  const normalized = [
    params.repositoryId,
    params.pullRequestNumber,
    params.filePath.toLowerCase(),
    params.lineStart ?? 0,
    params.category,
    params.title.toLowerCase().replace(/\s+/g, " ").trim(),
  ]
    .join("|")
    .toLowerCase();

  return createHash("sha256").update(normalized).digest("hex").slice(0, 32);
}

// ─── Score Calculation ────────────────────────────────────────────────────────

const SEVERITY_PENALTIES: Record<string, number> = {
  CRITICAL: 30,
  HIGH: 15,
  MEDIUM: 7,
  LOW: 2,
  INFO: 0,
};

export interface FindingCounts {
  critical: number;
  high: number;
  medium: number;
  low: number;
  info: number;
}

export function calculateScore(counts: FindingCounts): number {
  const penalty =
    counts.critical * SEVERITY_PENALTIES.CRITICAL +
    counts.high * SEVERITY_PENALTIES.HIGH +
    counts.medium * SEVERITY_PENALTIES.MEDIUM +
    counts.low * SEVERITY_PENALTIES.LOW;

  return Math.max(0, Math.min(100, 100 - penalty));
}
