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

function extractAmount(title: string, body: string | undefined, labels: string[]): number {
  // labels like "$500" or "💰 $200" are the cleanest signal
  for (const l of labels) {
    const m = l.match(/\$\s*(\d{2,5})/);
    if (m) {
      const n = Number(m[1]);
      if (n >= 10 && n <= 100000) return n;
    }
  }
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

async function fetchPolarBadgeAmount(badgeUrl: string): Promise<number> {
  try {
    const res = await fetch(badgeUrl, {
      headers: { "user-agent": "bounty-hunter/0.1" },
    });
    if (!res.ok) return 0;
    const svg = await res.text();
    // Polar badges render the funded amount as text in the SVG. Search for $NNN
    // patterns in the SVG content.
    const matches = [...svg.matchAll(/\$\s*(\d{2,5})/g)].map((m) => Number(m[1]));
    if (matches.length === 0) return 0;
    // take the largest — the pledge total is typically the biggest number shown
    return Math.max(...matches);
  } catch {
    return 0;
  }
}

function isBountyFarmRepo(nameWithOwner: string): boolean {
  const repo = nameWithOwner.split("/")[1]?.toLowerCase() ?? "";
  return /(^|-)(bounty|bounties|bounty-board|bounty-autopilot)($|-)/.test(repo);
}

// Honeypot orgs: publish AI-bait "bounties" then dox/blocklist the agents that
// attempt them. UnsafeLabs runs clankers-leaderboard.pages.dev and the labels
// "AI only allowed - no humans" / "AI Agent friendly" are the bait signature.
// Add others here as discovered.
const HONEYPOT_ORGS = new Set(["unsafelabs"]);
const HONEYPOT_LABELS = [
  /ai\s*only\s*allowed/i,
  /ai\s*agent\s*friendly/i,
  /clanker/i,
];

function isHoneypot(nameWithOwner: string, labels: string[]): boolean {
  const owner = nameWithOwner.split("/")[0]?.toLowerCase() ?? "";
  if (HONEYPOT_ORGS.has(owner)) return true;
  for (const l of labels) {
    if (HONEYPOT_LABELS.some((re) => re.test(l))) return true;
  }
  return false;
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

  const pendingPolar: { issue: GhIssue; badgeUrl: string }[] = [];

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
      if (q.includes("/bounty $") && isBountyFarmRepo(i.repository.nameWithOwner)) continue;

      const labels = i.labels.map((l) => l.name);
      if (isHoneypot(i.repository.nameWithOwner, labels)) {
        console.error(`  SKIP honeypot: ${i.url}`);
        continue;
      }
      const amount = extractAmount(i.title, i.body, labels);

      // queue Polar badge fetch if body contains the SVG URL but no inline amount
      const polarMatch = i.body?.match(
        /https:\/\/polar\.sh\/api\/github\/[^/]+\/[^/]+\/issues\/\d+\/pledge\.svg/
      );
      if (amount === 0 && polarMatch) {
        pendingPolar.push({ issue: i, badgeUrl: polarMatch[0] });
        continue;
      }
      if (amount === 0) continue;
      seen.add(i.url);
      out.push({
        amount,
        title: i.title,
        url: i.url,
        org: i.repository.nameWithOwner.split("/")[0],
        labels,
        createdAt: i.createdAt,
        body: i.body,
      });
    }
  }

  if (pendingPolar.length > 0) {
    console.error(`Fetching ${pendingPolar.length} Polar badge SVG(s) for amounts...`);
    for (const { issue: i, badgeUrl } of pendingPolar) {
      const amount = await fetchPolarBadgeAmount(badgeUrl);
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
      await sleep(500);
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
