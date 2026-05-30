import { readFile, writeFile, mkdir } from "node:fs/promises";
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
    created_at?: string;
    createdAt?: string;
    comments?: number;
    comments_count?: number;
  };
  repository?: { name: string; owner: { handle: string } };
  org?: { handle: string };
  status?: string;
  claims?: unknown[];
  claim_count?: number;
  attempts?: number;
  attempt_count?: number;
};

type Config = {
  orgs: string[];
  minReward: number;
  maxReward: number;
  preferredLabels: string[];
  blockedLabels: string[];
  maxAgeMonths?: number;
  maxExistingClaims?: number;
  topN: number;
};

const CONFIG_PATH = process.env.BOUNTY_CONFIG ?? resolve(process.cwd(), "config.json");
const DEBUG = process.argv.includes("--debug");
const JSON_OUT = process.argv.includes("--json");
const FROM_FLAG_IDX = process.argv.indexOf("--from");
const FROM_FILE = FROM_FLAG_IDX >= 0 ? process.argv[FROM_FLAG_IDX + 1] : undefined;

async function loadConfig(): Promise<Config> {
  try {
    const raw = await readFile(CONFIG_PATH, "utf8");
    return JSON.parse(raw);
  } catch (e) {
    console.error(`Could not read ${CONFIG_PATH}. Copy config.example.json to config.json and edit.`);
    throw e;
  }
}

function extractItems(raw: unknown): Bounty[] {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    // root-level array, or tRPC batch
    const tRpcShape = (raw as Array<{ result?: { data?: { json?: { items?: Bounty[] } } } }>)?.[0]
      ?.result?.data?.json?.items;
    if (Array.isArray(tRpcShape)) return tRpcShape;
    if ((raw as unknown[]).every((x) => x && typeof x === "object" && "reward" in (x as object))) {
      return raw as Bounty[];
    }
  }
  const obj = raw as Record<string, unknown>;
  if (Array.isArray(obj.items)) return obj.items as Bounty[];
  if (Array.isArray(obj.data)) return obj.data as Bounty[];
  if (Array.isArray(obj.bounties)) return obj.bounties as Bounty[];
  if (Array.isArray((obj.data as { items?: unknown })?.items)) {
    return ((obj.data as { items: Bounty[] }).items);
  }
  return [];
}

async function tryFetch(label: string, url: string, org: string): Promise<Bounty[] | null> {
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { accept: "application/json", "user-agent": "bounty-hunter/0.1" },
    });
  } catch (e) {
    if (DEBUG) console.error(`[${org}] ${label} fetch threw:`, (e as Error).message);
    return null;
  }
  if (!res.ok) {
    if (DEBUG) console.error(`[${org}] ${label} HTTP ${res.status}`);
    return null;
  }
  const text = await res.text();
  if (DEBUG) {
    await mkdir("debug", { recursive: true });
    await writeFile(`debug/${org}-${label}.json`, text);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    if (DEBUG) console.error(`[${org}] ${label}: non-JSON body`);
    return null;
  }
  const items = extractItems(parsed);
  if (DEBUG) console.error(`[${org}] ${label}: parsed ${items.length} items`);
  return items.length > 0 ? items : null;
}

async function fetchBountiesForOrg(org: string): Promise<Bounty[]> {
  const status = process.env.BOUNTY_STATUS ?? "open";
  // 1. documented REST
  const rest = await tryFetch(
    "rest",
    `https://console.algora.io/api/v1/bounties?org=${org}&status=${status}&limit=50`,
    org
  );
  if (rest) return rest;
  // 2. org-scoped REST
  const orgRest = await tryFetch(
    "orgrest",
    `https://console.algora.io/api/orgs/${org}/bounties?status=${status}&limit=50`,
    org
  );
  if (orgRest) return orgRest;
  // 3. tRPC fallback (old path)
  const payload: Record<string, unknown> = { org, limit: 50 };
  if (status !== "any") payload.status = status;
  const input = encodeURIComponent(JSON.stringify({ "0": { json: payload } }));
  const trpc = await tryFetch(
    "trpc",
    `https://console.algora.io/api/trpc/bounty.list?batch=1&input=${input}`,
    org
  );
  return trpc ?? [];
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

  // poison-pill: old issues that nobody has cracked
  const createdRaw = b.task.created_at ?? b.task.createdAt;
  if (createdRaw) {
    const ageMonths =
      (Date.now() - new Date(createdRaw).getTime()) / (1000 * 60 * 60 * 24 * 30);
    if (cfg.maxAgeMonths && ageMonths > cfg.maxAgeMonths) {
      return { score: -1, reasons: [`age ${ageMonths.toFixed(0)}mo > ${cfg.maxAgeMonths}mo`] };
    }
    if (ageMonths > 6) {
      score -= 5;
      reasons.push(`old:${ageMonths.toFixed(0)}mo`);
    }
  }

  // poison-pill: many existing failed claims
  const claimCount =
    (Array.isArray(b.claims) ? b.claims.length : undefined) ??
    b.claim_count ??
    b.attempt_count ??
    b.attempts ??
    0;
  if (cfg.maxExistingClaims !== undefined && claimCount > cfg.maxExistingClaims) {
    return { score: -1, reasons: [`${claimCount} prior claims (poison)`] };
  }
  if (claimCount > 0) {
    score -= 3 * claimCount;
    reasons.push(`${claimCount} claim(s)`);
  }

  // poison-pill: huge comment thread (contention)
  const commentCount = b.task.comments ?? b.task.comments_count ?? 0;
  if (commentCount > 20) {
    score -= 5;
    reasons.push(`${commentCount} comments`);
  }

  return { score, reasons };
}

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

function adaptScraped(s: ScrapedBounty): Bounty {
  return {
    reward: { amount: s.amount, currency: s.currency },
    task: {
      title: s.title ?? "(no title)",
      body: s.body,
      url: s.url,
      labels: s.labels?.map((name) => ({ name })),
      createdAt: s.createdAt,
    },
    claim_count: s.claimCount,
    org: s.org ? { handle: s.org } : undefined,
  };
}

async function main() {
  const cfg = await loadConfig();
  const all: { b: Bounty; org: string }[] = [];

  if (FROM_FILE) {
    if (!JSON_OUT) console.error(`Loading bounties from ${FROM_FILE}...`);
    const raw = await readFile(resolve(process.cwd(), FROM_FILE), "utf8");
    const scraped = JSON.parse(raw) as ScrapedBounty[];
    if (!JSON_OUT) console.error(`  ${scraped.length} bounties loaded`);
    for (const s of scraped) {
      all.push({ b: adaptScraped(s), org: s.org ?? "?" });
    }
  } else {
    const orgs = process.env.BOUNTY_ORGS
      ? process.env.BOUNTY_ORGS.split(",").map((s) => s.trim()).filter(Boolean)
      : cfg.orgs;
    if (!JSON_OUT) console.error(`Scanning ${orgs.length} orgs...`);
    for (const org of orgs) {
      const items = await fetchBountiesForOrg(org);
      if (!JSON_OUT) console.error(`  ${org}: ${items.length} open`);
      for (const b of items) all.push({ b, org });
    }
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
