import { execSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync, appendFileSync } from "node:fs";
import { resolve } from "node:path";

const args = process.argv.slice(2);
const FORCE = args.includes("--force");
const issueUrl = args.find((a) => !a.startsWith("--"));
if (!issueUrl) {
  console.error("Usage: npm run attempt -- <github-issue-url> [--force]");
  console.error("Example: npm run attempt -- https://github.com/cal/cal.com/issues/12345");
  process.exit(1);
}

const m = issueUrl.match(/github\.com\/([^/]+)\/([^/]+)\/issues\/(\d+)/);
if (!m) {
  console.error("Issue URL must look like https://github.com/<owner>/<repo>/issues/<n>");
  process.exit(1);
}
const [, owner, repo, issueNum] = m;

function shCapture(cmd: string): string {
  return execSync(cmd, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

console.error(`Pre-flight check: ${owner}/${repo}#${issueNum}`);
let issue: {
  state?: string;
  title?: string;
  body?: string;
  pull_request?: unknown;
  assignees?: { login: string }[];
  labels?: { name: string }[];
  created_at?: string;
};
try {
  issue = JSON.parse(shCapture(`gh api repos/${owner}/${repo}/issues/${issueNum}`));
} catch (e) {
  console.error(`Could not fetch issue. Is gh authenticated? (${(e as Error).message.split("\n")[0]})`);
  process.exit(1);
}

const blocking: string[] = [];
if (issue.state && issue.state !== "open") blocking.push(`state=${issue.state}`);
if (issue.pull_request) blocking.push("is a PR, not an issue");
if (issue.assignees && issue.assignees.length > 0) {
  blocking.push(`assigned to ${issue.assignees.map((a) => a.login).join(",")}`);
}

let linkedPrs: { number: number; state: string; author: { login: string }; title: string }[] = [];
try {
  const search = `${issueUrl} in:body`;
  linkedPrs = JSON.parse(
    shCapture(
      `gh pr list -R ${owner}/${repo} --state all --search ${JSON.stringify(search)} --json number,state,author,title --limit 10`
    )
  );
} catch {
  // non-fatal
}
const openPrs = linkedPrs.filter((p) => p.state === "OPEN");
const mergedPrs = linkedPrs.filter((p) => p.state === "MERGED");
if (mergedPrs.length > 0) blocking.push(`merged PR exists: #${mergedPrs[0].number}`);
if (openPrs.length > 0) {
  console.error(`Warning: ${openPrs.length} open PR(s) already linked:`);
  for (const p of openPrs) console.error(`  #${p.number} by ${p.author.login}: ${p.title}`);
}

console.error(`\nTitle: ${issue.title}`);
console.error(`Labels: ${issue.labels?.map((l) => l.name).join(", ") ?? "(none)"}`);
console.error(`Opened: ${issue.created_at ?? "?"}`);
if (issue.body) {
  const snippet = issue.body.replace(/\r/g, "").slice(0, 600);
  console.error(`\n--- body (first 600 chars) ---\n${snippet}\n--- end ---\n`);
}

if (blocking.length > 0) {
  console.error(`BLOCKED: ${blocking.join("; ")}`);
  if (!FORCE) {
    console.error(`Pass --force to override.`);
    process.exit(2);
  }
  console.error(`(--force set, proceeding anyway)`);
}

const workdir = resolve(process.env.BOUNTY_WORKDIR ?? "./workspace");
if (!existsSync(workdir)) mkdirSync(workdir, { recursive: true });

const repoDir = resolve(workdir, `${owner}-${repo}`);
const branch = `bounty/issue-${issueNum}`;

function sh(cmd: string, cwd?: string) {
  console.log(`$ ${cmd}`);
  execSync(cmd, { stdio: "inherit", cwd });
}

if (!existsSync(repoDir)) {
  sh(`gh repo fork ${owner}/${repo} --clone=true --remote=true`, workdir);
  const cloneDefault = resolve(workdir, repo);
  if (existsSync(cloneDefault) && cloneDefault !== repoDir) {
    sh(`mv ${cloneDefault} ${repoDir}`);
  }
} else {
  console.log(`(${repoDir} exists, skipping fork)`);
}

try {
  sh(`git checkout -b ${branch}`, repoDir);
} catch {
  sh(`git checkout ${branch}`, repoDir);
}

const note = `# Bounty workspace

- Issue: ${issueUrl}
- Branch: ${branch}

## Plan
1. Read the issue. Confirm scope.
2. Locate relevant code via grep / file tree.
3. Implement minimal fix. Add or update a test if the repo has tests.
4. Run lint/tests locally.
5. Push branch to fork. Open PR.
6. In PR body include: \`/claim #${issueNum}\`

## Hard rules
- Do not refactor or fix unrelated lint warnings in this PR.
- Match the project's existing code style.
- If scope is unclear after reading the issue and code, stop and ask.
`;
writeFileSync(resolve(repoDir, "BOUNTY.md"), note);

const exclude = resolve(repoDir, ".git/info/exclude");
appendFileSync(exclude, "\nBOUNTY.md\n");

const journalPath = resolve(process.cwd(), "attempts.jsonl");
appendFileSync(
  journalPath,
  JSON.stringify({
    ts: new Date().toISOString(),
    issue: issueUrl,
    title: issue.title,
    repoDir,
    branch,
  }) + "\n"
);
console.error(`Logged to ${journalPath}`);

console.log(`
=== Ready ===
cd ${repoDir}
# Then drive with Claude Code or your editor:
claude

# When done:
git push -u origin ${branch}
gh pr create --body "Closes #${issueNum}

/claim #${issueNum}"
`);
