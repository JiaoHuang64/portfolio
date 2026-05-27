import { execSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync, appendFileSync } from "node:fs";
import { resolve } from "node:path";

const issueUrl = process.argv[2];
if (!issueUrl) {
  console.error("Usage: npm run attempt -- <github-issue-url>");
  console.error("Example: npm run attempt -- https://github.com/cal/cal.com/issues/12345");
  process.exit(1);
}

const m = issueUrl.match(/github\.com\/([^/]+)\/([^/]+)\/issues\/(\d+)/);
if (!m) {
  console.error("Issue URL must look like https://github.com/<owner>/<repo>/issues/<n>");
  process.exit(1);
}
const [, owner, repo, issueNum] = m;

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
