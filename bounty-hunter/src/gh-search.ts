import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";

type ScrapedBounty = {
  amount: number;
  currency?: string;
  title?: string;
  url: string;
  org?: string;
  labels?: string[];
  createdAt?: string;
  body?: string;
  claimCount?: number;
};

const args = process.argv.slice(2);
const APPEND = args.includes("--append");
const OUT_IDX = args.indexOf("--out");
const OUT = OUT_IDX >= 0 ? args[OUT_IDX + 1] : "bounties.json";
const LIMIT_IDX = args.indexOf("--limit");
const LIMIT = LIMIT_IDX >= 0 ? Number(args[LIMIT_IDX + 1]) : 100;

// Label-based queries return mostly noise (squatter repos, $1 jokes, abandoned
// Paratii forks). Real bounties on Algora/Polar embed markers into the issue
// body itself. We search for those markers instead.
const QUERIES = [
  '"polar.sh/api/github" is:issue is:open no:assignee',         // Polar SVG badge URL
  '"algora.io" "$" is:issue is:open no:assignee',               // Algora link + dollar mention
  '"💎 Bounty" is:issue is:open no:assignee',                   // Algora's emoji marker
  '"/bounty $" is:issue is:open no:assignee',                   // direct slash-command echo
];

type GhIssue = {
  number: number;
  title: string;
  body?: string;
  url: string;
  state: string;
  createdAt: string;
  labels: { name: string }[];
  assignees: { login: string }[];
  repository: { nameWithOwner: string; url: string };
  comments: number;
};

function ghJson(cmd: string): unknown {
  try {
    return JSON.parse(execSync(cmd, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }));
  } catch (e) {
    console.error(`gh failed: ${(e as Error).message.split("\n")[0]}`);
    return null;
  }
}

function extractAmount(title: string, body?: string): number {
  // common forms: "[$500]", "($300)", "Bounty: $1000", "💰 $250"
  const merged = `${title}\n${body ?? ""}`;
  const patterns = [
    /\$\s*(\d{2,5})(?:\s*USD)?/i,
    /USD\s*(\d{2,5})/i,
    /bounty[:\s]+\$?\s*(\d{2,5})/i,
    /(\d{2,5})\s*USD\s*bounty/i,
  ];
  for (const p of patterns) {
    const m = merged.match(p);
    if (m) {
      const n = Number(m[1]);
      if (n >= 10 && n <= 100000) return n;
    }
  }
  return 0;
}

async function main() {
  console.error(`Running ${QUERIES.length} GitHub searches (limit ${LIMIT} each)...`);
  const seen = new Set<string>();
  const out: ScrapedBounty[] = [];

  if (APPEND && existsSync(OUT)) {
    const prev = JSON.parse(readFileSync(OUT, "utf8")) as ScrapedBounty[];
    for (const b of prev) {
      seen.add(b.url);
      out.push(b);
    }
    console.error(`Loaded ${prev.length} existing bounties from ${OUT}`);
  }

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  for (const [idx, q] of QUERIES.entries()) {
    if (idx > 0) await sleep(5000); // dodge secondary rate limit
    const cmd = `gh search issues ${JSON.stringify(q)} --limit ${LIMIT} --json number,title,body,url,state,createdAt,labels,assignees,repository,comments`;
    const issues = ghJson(cmd) as GhIssue[] | null;
    if (!issues) continue;
    console.error(`  "${q}" -> ${issues.length} issues`);
    for (const i of issues) {
      if (seen.has(i.url)) continue;
      if (i.assignees && i.assignees.length > 0) continue;
      if (i.comments > 25) continue;
      const amount = extractAmount(i.title, i.body);
      if (amount === 0) continue;
      seen.add(i.url);
      out.push({
        amount,
        title: i.title,
        url: i.url,
        org: i.repository.nameWithOwner.split("/")[0],
        labels: i.labels.map((l) => l.name),
        createdAt: i.createdAt,
        body: i.body,
      });
    }
  }

  out.sort((a, b) => b.amount - a.amount);
  writeFileSync(OUT, JSON.stringify(out, null, 2));
  console.error(`\nWrote ${out.length} bounties to ${OUT}`);
  console.error(`Top 10:`);
  for (const b of out.slice(0, 10)) {
    console.error(`  $${b.amount}\t${b.url}\t${b.title?.slice(0, 60)}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
