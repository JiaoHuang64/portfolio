import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

type Bounty = {
  id?: string;
  reward: { amount: number; currency?: string };
  task: {
    title: string;
    body?: string;
    url: string;
    number?: number;
    labels?: { name: string }[];
  };
  repository?: { name: string; owner: { handle: string } };
  org?: { handle: string };
  status?: string;
};

type Config = {
  orgs: string[];
  minReward: number;
  maxReward: number;
  preferredLabels: string[];
  blockedLabels: string[];
  topN: number;
};

const CONFIG_PATH = process.env.BOUNTY_CONFIG ?? resolve(process.cwd(), "config.json");
const DEBUG = process.argv.includes("--debug");
const JSON_OUT = process.argv.includes("--json");

async function loadConfig(): Promise<Config> {
  try {
    const raw = await readFile(CONFIG_PATH, "utf8");
    return JSON.parse(raw);
  } catch (e) {
    console.error(`Could not read ${CONFIG_PATH}. Copy config.example.json to config.json and edit.`);
    throw e;
  }
}

async function fetchBountiesForOrg(org: string): Promise<Bounty[]> {
  const payload: Record<string, unknown> = { org, limit: 50 };
  if (process.env.BOUNTY_STATUS !== "any") {
    payload.status = process.env.BOUNTY_STATUS ?? "active";
  }
  const input = encodeURIComponent(
    JSON.stringify({ "0": { json: payload } })
  );
  const url = `https://console.algora.io/api/trpc/bounty.list?batch=1&input=${input}`;
  const res = await fetch(url, {
    headers: {
      accept: "application/json",
      "user-agent": "bounty-hunter/0.1",
    },
  });
  if (!res.ok) {
    console.error(`[${org}] HTTP ${res.status}`);
    return [];
  }
  const data = (await res.json()) as unknown;
  if (DEBUG) console.error(`[${org}] raw:`, JSON.stringify(data).slice(0, 400));
  // tRPC batch response shape: [{ result: { data: { json: { items, next_cursor } } } }]
  const arr = data as Array<{ result?: { data?: { json?: { items?: Bounty[] } } } }>;
  return arr?.[0]?.result?.data?.json?.items ?? [];
}

function scoreBounty(
  b: Bounty,
  cfg: Config
): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  let score = 0;
  const amount = b.reward.amount;

  if (amount < cfg.minReward) return { score: -1, reasons: [`< $${cfg.minReward}`] };
  if (amount > cfg.maxReward) return { score: -1, reasons: [`> $${cfg.maxReward}`] };

  score += Math.log10(amount + 1) * 10;
  reasons.push(`$${amount}`);

  const labels = b.task.labels?.map((l) => l.name.toLowerCase()) ?? [];
  for (const pref of cfg.preferredLabels) {
    if (labels.some((l) => l.includes(pref.toLowerCase()))) {
      score += 5;
      reasons.push(`+${pref}`);
    }
  }
  for (const bad of cfg.blockedLabels) {
    if (labels.some((l) => l.includes(bad.toLowerCase()))) {
      score -= 10;
      reasons.push(`-${bad}`);
    }
  }

  const bodyLen = b.task.body?.length ?? 0;
  if (bodyLen < 100) {
    score -= 5;
    reasons.push("thin-body");
  } else if (bodyLen > 5000) {
    score -= 5;
    reasons.push("huge-body");
  } else {
    score += 3;
    reasons.push("body-ok");
  }

  return { score, reasons };
}

async function main() {
  const cfg = await loadConfig();
  const orgs = process.env.BOUNTY_ORGS
    ? process.env.BOUNTY_ORGS.split(",").map((s) => s.trim()).filter(Boolean)
    : cfg.orgs;
  if (!JSON_OUT) console.error(`Scanning ${orgs.length} orgs...`);

  const all: { b: Bounty; org: string }[] = [];
  for (const org of orgs) {
    const items = await fetchBountiesForOrg(org);
    if (!JSON_OUT) console.error(`  ${org}: ${items.length} open`);
    for (const b of items) all.push({ b, org });
  }

  const scored = all
    .map(({ b, org }) => ({ b, org, ...scoreBounty(b, cfg) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, cfg.topN);

  if (JSON_OUT) {
    console.log(JSON.stringify(scored, null, 2));
    return;
  }

  console.log(`\n=== Top ${scored.length} candidates ===\n`);
  for (const { b, org, score, reasons } of scored) {
    console.log(`[$${b.reward.amount}] ${b.task.title}`);
    console.log(`  ${b.task.url}`);
    console.log(`  ${org} · score ${score.toFixed(1)} · ${reasons.join(", ")}`);
    console.log();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
