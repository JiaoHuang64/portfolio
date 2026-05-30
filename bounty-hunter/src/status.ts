import { readFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { resolve } from "node:path";

type Entry = {
  ts: string;
  issue: string;
  title?: string;
  repoDir?: string;
  branch?: string;
};

const journalPath = resolve(process.cwd(), "attempts.jsonl");
if (!existsSync(journalPath)) {
  console.error(`No ${journalPath} yet. Run \`npm run attempt -- <url>\` first.`);
  process.exit(1);
}

const entries: Entry[] = readFileSync(journalPath, "utf8")
  .split("\n")
  .filter(Boolean)
  .map((l) => JSON.parse(l) as Entry);

// dedupe by issue url, keep most recent
const byIssue = new Map<string, Entry>();
for (const e of entries) byIssue.set(e.issue, e);

function ghJson(cmd: string): unknown {
  try {
    return JSON.parse(execSync(cmd, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }));
  } catch {
    return null;
  }
}

function localBranchAhead(repoDir: string, branch: string): number | null {
  try {
    const out = execSync(
      `git -C ${JSON.stringify(repoDir)} rev-list --count HEAD ^origin/HEAD 2>/dev/null || git -C ${JSON.stringify(repoDir)} rev-list --count ${branch} 2>/dev/null`,
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }
    ).trim();
    return Number(out) || 0;
  } catch {
    return null;
  }
}

type Row = {
  issue: string;
  title: string;
  state: string;
  detail: string;
  ts: string;
};

const rows: Row[] = [];

for (const [issueUrl, e] of byIssue) {
  const m = issueUrl.match(/github\.com\/([^/]+)\/([^/]+)\/issues\/(\d+)/);
  if (!m) continue;
  const [, owner, repo, num] = m;

  const issue = ghJson(`gh api repos/${owner}/${repo}/issues/${num}`) as
    | { state?: string; state_reason?: string; closed_at?: string }
    | null;

  const prs = (ghJson(
    `gh pr list -R ${owner}/${repo} --state all --search ${JSON.stringify(issueUrl + " in:body")} --json number,state,author,url,mergedAt --limit 5`
  ) as Array<{ number: number; state: string; author: { login: string }; url: string; mergedAt?: string }> | null) ?? [];

  const me =
    (ghJson(`gh api user`) as { login?: string } | null)?.login ?? "";
  const myPrs = prs.filter((p) => p.author.login === me);
  const otherPrs = prs.filter((p) => p.author.login !== me);

  let state: string;
  let detail: string;

  if (issue?.state === "closed") {
    const mergedMine = myPrs.find((p) => p.state === "MERGED");
    const mergedOther = otherPrs.find((p) => p.state === "MERGED");
    if (mergedMine) {
      state = "MERGED-MINE";
      detail = `PR #${mergedMine.number} merged ${mergedMine.mergedAt?.slice(0, 10)} (check payout)`;
    } else if (mergedOther) {
      state = "LOST";
      detail = `${mergedOther.author.login}'s PR #${mergedOther.number} merged`;
    } else {
      state = "CLOSED";
      detail = `issue closed without PR merge`;
    }
  } else if (myPrs.length > 0) {
    const mine = myPrs[0];
    state = mine.state === "OPEN" ? "PR-OPEN" : `PR-${mine.state}`;
    detail = `my PR #${mine.number}`;
  } else if (otherPrs.some((p) => p.state === "OPEN")) {
    const o = otherPrs.find((p) => p.state === "OPEN")!;
    state = "OUTPACED";
    detail = `${o.author.login}'s PR #${o.number} open`;
  } else if (e.repoDir && existsSync(e.repoDir) && e.branch) {
    const ahead = localBranchAhead(e.repoDir, e.branch);
    state = ahead && ahead > 0 ? "WORKING" : "FORKED";
    detail = ahead && ahead > 0 ? `${ahead} commit(s) ahead, no PR` : `forked, no commits`;
  } else {
    state = "ABANDONED";
    detail = `workspace missing`;
  }

  rows.push({
    issue: issueUrl.replace("https://github.com/", ""),
    title: (e.title ?? "(no title)").slice(0, 50),
    state,
    detail,
    ts: e.ts.slice(0, 10),
  });
}

const order = ["MERGED-MINE", "PR-OPEN", "WORKING", "FORKED", "OUTPACED", "PR-CLOSED", "LOST", "CLOSED", "ABANDONED"];
rows.sort((a, b) => order.indexOf(a.state) - order.indexOf(b.state));

const widths = {
  state: Math.max(5, ...rows.map((r) => r.state.length)),
  issue: Math.max(5, ...rows.map((r) => r.issue.length)),
};

console.log(
  ["STATE".padEnd(widths.state), "DATE".padEnd(10), "ISSUE".padEnd(widths.issue), "TITLE  /  DETAIL"].join("  ")
);
for (const r of rows) {
  console.log(
    [r.state.padEnd(widths.state), r.ts.padEnd(10), r.issue.padEnd(widths.issue), `${r.title}  ::  ${r.detail}`].join("  ")
  );
}

const counts: Record<string, number> = {};
for (const r of rows) counts[r.state] = (counts[r.state] ?? 0) + 1;
console.log(`\nTotal: ${rows.length}  |  ${Object.entries(counts).map(([k, v]) => `${k}:${v}`).join("  ")}`);
