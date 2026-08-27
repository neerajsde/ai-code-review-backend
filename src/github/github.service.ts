import { App as OctokitApp } from "@octokit/app";
import { Octokit } from "@octokit/rest";
import { ENV } from "../config/env.js";
import logger from "../utils/logger.js";

// ─── GitHub App Client (singleton) ───────────────────────────────────────────
let githubApp: OctokitApp | null = null;

function getGitHubApp(): OctokitApp {
  if (!githubApp) {
    const privateKey = ENV.GITHUB_APP_PRIVATE_KEY.replace(/\\n/g, "\n");

    githubApp = new OctokitApp({
      appId: ENV.GITHUB_APP_ID,
      privateKey,
      oauth: {
        clientId: ENV.GITHUB_CLIENT_ID,
        clientSecret: ENV.GITHUB_CLIENT_SECRET,
      },
      webhooks: {
        secret: ENV.GITHUB_WEBHOOK_SECRET,
      },
    });
  }
  return githubApp;
}

// ─── Installation-scoped Octokit ─────────────────────────────────────────────
export async function getInstallationOctokit(
  installationId: number
): Promise<Octokit> {
  const app = getGitHubApp();
  return app.getInstallationOctokit(installationId) as unknown as Octokit;
}

// ─── User-scoped Octokit (OAuth) ─────────────────────────────────────────────
export function getUserOctokit(accessToken: string): Octokit {
  return new Octokit({ auth: accessToken });
}

// ─── GitHub OAuth URLs ────────────────────────────────────────────────────────
export function buildGitHubOAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: ENV.GITHUB_CLIENT_ID,
    redirect_uri: `${ENV.BACKEND_URL}/api/v1/auth/github/callback`,
    scope: "read:user user:email",
    state,
  });
  return `https://github.com/login/oauth/authorize?${params.toString()}`;
}

export async function exchangeCodeForToken(code: string): Promise<string> {
  const app = getGitHubApp();
  const { authentication } = await app.oauth.createToken({ code });
  return authentication.token;
}

// ─── GitHub Pull Request Types ────────────────────────────────────────────────
export interface GitHubPRFile {
  filename: string;
  status: "added" | "modified" | "removed" | "renamed" | "copied" | "changed" | "unchanged";
  additions: number;
  deletions: number;
  changes: number;
  patch?: string;
  blobUrl: string;
}

export interface GitHubPR {
  number: number;
  title: string;
  body: string | null;
  state: string;
  draft: boolean;
  merged: boolean;
  headSha: string;
  baseSha: string;
  headBranch: string;
  baseBranch: string;
  author: string;
  authorAvatarUrl: string;
  htmlUrl: string;
  additions: number;
  deletions: number;
  changedFiles: number;
}

// ─── GitHub Service Functions ─────────────────────────────────────────────────

export async function getPullRequest(
  installationId: number,
  owner: string,
  repo: string,
  prNumber: number
): Promise<GitHubPR> {
  const octokit = await getInstallationOctokit(installationId);
  const { data } = await octokit.pulls.get({
    owner,
    repo,
    pull_number: prNumber,
  });

  return {
    number: data.number,
    title: data.title,
    body: data.body,
    state: data.state,
    draft: data.draft ?? false,
    merged: data.merged ?? false,
    headSha: data.head.sha,
    baseSha: data.base.sha,
    headBranch: data.head.ref,
    baseBranch: data.base.ref,
    author: data.user?.login ?? "",
    authorAvatarUrl: data.user?.avatar_url ?? "",
    htmlUrl: data.html_url,
    additions: data.additions,
    deletions: data.deletions,
    changedFiles: data.changed_files,
  };
}

export async function getPullRequestFiles(
  installationId: number,
  owner: string,
  repo: string,
  prNumber: number
): Promise<GitHubPRFile[]> {
  const octokit = await getInstallationOctokit(installationId);
  const files: GitHubPRFile[] = [];

  // GitHub paginates files at 30 per page, max 3000 files
  for await (const response of octokit.paginate.iterator(
    octokit.pulls.listFiles,
    {
      owner,
      repo,
      pull_number: prNumber,
      per_page: 100,
    }
  )) {
    for (const file of response.data) {
      files.push({
        filename: file.filename,
        status: file.status as GitHubPRFile["status"],
        additions: file.additions,
        deletions: file.deletions,
        changes: file.changes,
        patch: file.patch,
        blobUrl: file.blob_url,
      });
    }
  }

  return files;
}

export interface GitHubReviewComment {
  path: string;
  line: number;
  body: string;
}

export async function createPullRequestReview(
  installationId: number,
  owner: string,
  repo: string,
  prNumber: number,
  commitId: string,
  body: string,
  comments: GitHubReviewComment[]
): Promise<{ id: number; htmlUrl: string }> {
  const octokit = await getInstallationOctokit(installationId);

  const { data } = await octokit.pulls.createReview({
    owner,
    repo,
    pull_number: prNumber,
    commit_id: commitId,
    body,
    event: "COMMENT",
    comments: comments.map((c) => ({
      path: c.path,
      line: c.line,
      body: c.body,
      side: "RIGHT" as const,
    })),
  });

  return {
    id: data.id,
    htmlUrl: data.html_url,
  };
}

export async function getInstallationRepositories(
  installationId: number
): Promise<
  Array<{
    githubRepositoryId: number;
    name: string;
    fullName: string;
    private: boolean;
    defaultBranch: string;
    language: string | null;
    description: string | null;
    htmlUrl: string;
  }>
> {
  const octokit = await getInstallationOctokit(installationId);
  const repos: ReturnType<typeof getInstallationRepositories> extends Promise<infer T> ? T : never = [];

  for await (const response of octokit.paginate.iterator(
    octokit.apps.listReposAccessibleToInstallation,
    { per_page: 100 }
  )) {
    for (const repo of response.data) {
      repos.push({
        githubRepositoryId: repo.id,
        name: repo.name,
        fullName: repo.full_name,
        private: repo.private,
        defaultBranch: repo.default_branch,
        language: repo.language ?? null,
        description: repo.description ?? null,
        htmlUrl: repo.html_url,
      });
    }
  }

  return repos;
}

export async function getInstallationInfo(installationId: number) {
  const app = getGitHubApp();
  const octokit = await app.getInstallationOctokit(installationId);
  const { data } = await (octokit as unknown as Octokit).apps.getInstallation({
    installation_id: installationId,
  });
  return data;
}

export async function getAuthenticatedUser(accessToken: string) {
  const octokit = getUserOctokit(accessToken);
  const { data } = await octokit.users.getAuthenticated();
  const emailsResponse = await octokit.users.listEmailsForAuthenticatedUser();
  const primaryEmail = emailsResponse.data.find((e) => e.primary)?.email ?? null;

  return {
    githubId: String(data.id),
    username: data.login,
    displayName: data.name ?? data.login,
    email: primaryEmail,
    avatarUrl: data.avatar_url,
  };
}

logger.info("✅ GitHub service initialized");
