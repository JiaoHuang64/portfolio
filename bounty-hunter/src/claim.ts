import { execSync } from "node:child_process";
import { readFileSync, appendFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const args = process.argv.slice(2);
const NO_PUSH = args.includes("--no-push");
const SKIP_CHECKS = args.includes("--skip-checks");
const DRY = args.includes("--dry-run");
const issueUrl = args.find((a) => a.startsWith("http"));

if (!issueUrl) {
  console.error("Usage: npm run claim -- <github-issue-url> [--no-push] [--skip-checks] [--dry-run]");
  console.error("Must be run from within the forked repo workspace.");
  process.exit(1);
}

const m = issueUrl.match(/github\.com\/([^/]+)\/([^/]+)\/issues\/(\d+)/);
if (!m) {
  console.error("Issue URL must look like https://github.com/<owner>/<repo>/issues/<n>");
  process.exit(1);
}
const [, owner, repo, issueNum] = m;

function shCapture(cmd: string, cwd?: string): string {
  return execSync(cmd, { encoding: "utf8", cwd, stdio: ["ignore", "pipe", "pipe"] }).trim();
}
function sh(cmd: string, cwd?: string) {
  console.log(`$ ${cmd}`);
  if (DRY) return;
  execSync(cmd, { stdio: "inherit", cwd });
}

// figure out which repo dir we're in: prefer cwd if it's a git repo matching upstream
let repoDir = process.cwd();
try {
  const remoteUrl = shCapture(`git remote get-url upstream 2>/dev/null || git remote get-url origin`);
  if (!remoteUrl.includes(`${owner}/${repo}`)) {
    // try workspace path
    const guess = resolve(process.env.BOUNTY_WORKDIR ?? "./workspace", `${owner}-${repo}`);
    if (existsSync(guess)) {
      repoDir = guess;
      console.error(`cwd doesn't match ${owner}/${repo}, using ${guess}`);
    } else {
      console.error(`Not in a ${owner}/${repo} checkout and no workspace dir at ${guess}. cd in or set BOUNTY_WORKDIR.`);
      process.exit(1);
    }
  }
} catch (e) {
  console.error(`git remote check failed: ${(e as Error).message.split("\n")[0]}`);
  process.exit(1);
}

const branch = shCapture(`git -C ${JSON.stringify(repoDir)} rev-parse --abbrev-ref HEAD`);
if (branch === "main" || branch === "master") {
  console.error(`Refusing to push from ${branch}. Switch to a bounty/* branch first.`);
  process.exit(1);
}

const ahead = Number(
  shCapture(
    `git -C ${JSON.stringify(repoDir)} rev-list --count ${branch} ^origin/HEAD 2>/dev/null || echo 0`
  ) || "0"
);
if (ahead === 0) {
  console.error(`Branch ${branch} has no commits ahead of origin/HEAD. Nothing to claim.`);
  process.exit(1);
}
console.error(`Branch ${branch}: ${ahead} commit(s) ahead.`);

const dirty = shCapture(`git -C ${JSON.stringify(repoDir)} status --porcelain`);
if (dirty) {
  console.error("Working tree is dirty. Commit or stash first:");
  console.error(dirty);
  process.exit(1);
}

if (!SKIP_CHECKS) {
  // try common checks if scripts exist
  let pkgJson: { scripts?: Record<string, string> } | null = null;
  try {
    pkgJson = JSON.parse(readFileSync(resolve(repoDir, "package.json"), "utf8"));
  } catch {
    // not a node project, skip
  }
  if (pkgJson?.scripts) {
    for (const cmd of ["lint", "typecheck", "test"]) {
      if (pkgJson.scripts[cmd]) {
        try {
          sh(`npm run ${cmd}`, repoDir);
        } catch {
          console.error(`\nnpm run ${cmd} failed. Fix or pass --skip-checks.`);
          process.exit(1);
        }
      }
    }
  }
}

sh(`git push -u origin ${branch}`, repoDir);
if (NO_PUSH) {
  console.error("--no-push set, skipping PR creation.");
  process.exit(0);
}

let issueTitle = `Fix #${issueNum}`;
try {
  const t = shCapture(`gh api repos/${owner}/${repo}/issues/${issueNum} -q .title`);
  if (t) issueTitle = t;
} catch {
  // fall back to generic title
}

const body = `Closes #${issueNum}

/claim #${issueNum}`;

let prUrl = "";
if (!DRY) {
  prUrl = execSync(
    `gh pr create --repo ${owner}/${repo} --head $(gh api user -q .login):${branch} --title ${JSON.stringify(issueTitle)} --body ${JSON.stringify(body)}`,
    { cwd: repoDir, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] }
  ).trim();
  console.log(prUrl);
} else {
  console.log(`(dry-run) would create PR against ${owner}/${repo} from ${branch} titled "${issueTitle}"`);
}

const journalPath = resolve(process.cwd(), "attempts.jsonl");
if (!DRY && existsSync(journalPath)) {
  appendFileSync(
    journalPath,
    JSON.stringify({
      ts: new Date().toISOString(),
      event: "pr-opened",
      issue: issueUrl,
      pr: prUrl,
      branch,
    }) + "\n"
  );
  console.error(`Logged PR to ${journalPath}`);
}
