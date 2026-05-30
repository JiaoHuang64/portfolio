import { writeFileSync } from "node:fs";

const url = process.argv[2] ?? "https://algora.io/bounties";

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

function walkForBounties(node: unknown, out: ScrapedBounty[], seen = new WeakSet<object>()): void {
  if (!node || typeof node !== "object") return;
  if (seen.has(node as object)) return;
  seen.add(node as object);

  if (Array.isArray(node)) {
    for (const item of node) walkForBounties(item, out, seen);
    return;
  }

  const o = node as Record<string, unknown>;
  // detect bounty-ish shape: reward.amount + task.url OR amount + url
  const reward = o.reward as Record<string, unknown> | undefined;
  const task = (o.task ?? o.issue) as Record<string, unknown> | undefined;
  const amount =
    (typeof o.amount === "number" ? o.amount : undefined) ??
    (reward && typeof reward.amount === "number" ? reward.amount : undefined);
  const issueUrl =
    (typeof o.url === "string" && o.url.includes("/issues/") ? o.url : undefined) ??
    (task && typeof task.url === "string" && task.url.includes("/issues/")
      ? (task.url as string)
      : undefined);

  if (amount && issueUrl) {
    const labelsRaw = (task?.labels ?? o.labels) as unknown;
    const labels = Array.isArray(labelsRaw)
      ? (labelsRaw as unknown[])
          .map((l) => (typeof l === "string" ? l : (l as { name?: string })?.name))
          .filter((x): x is string => typeof x === "string")
      : undefined;
    const orgRaw = (o.org ?? o.repository) as Record<string, unknown> | undefined;
    const orgHandle =
      (orgRaw && typeof orgRaw.handle === "string" ? (orgRaw.handle as string) : undefined) ??
      (issueUrl.match(/github\.com\/([^/]+)\//)?.[1]);

    out.push({
      amount: amount as number,
      currency:
        (reward && typeof reward.currency === "string" ? (reward.currency as string) : undefined) ??
        (typeof o.currency === "string" ? (o.currency as string) : undefined),
      title:
        (task && typeof task.title === "string" ? (task.title as string) : undefined) ??
        (typeof o.title === "string" ? (o.title as string) : undefined),
      url: issueUrl,
      org: orgHandle,
      labels,
      createdAt:
        (task && (task.created_at ?? task.createdAt)) as string | undefined ??
        ((o.created_at ?? o.createdAt) as string | undefined),
      body:
        (task && typeof task.body === "string" ? (task.body as string) : undefined) ??
        (typeof o.body === "string" ? (o.body as string) : undefined),
      claimCount:
        typeof o.claim_count === "number"
          ? (o.claim_count as number)
          : Array.isArray(o.claims)
          ? (o.claims as unknown[]).length
          : undefined,
    });
  }

  for (const v of Object.values(o)) walkForBounties(v, out, seen);
}

function dedupe(list: ScrapedBounty[]): ScrapedBounty[] {
  const seen = new Set<string>();
  const out: ScrapedBounty[] = [];
  for (const b of list) {
    const key = `${b.url}|${b.amount}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(b);
  }
  return out;
}

async function main() {
  console.error(`Fetching ${url} ...`);
  const res = await fetch(url, {
    headers: {
      accept: "text/html,application/xhtml+xml",
      "user-agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
    },
  });
  if (!res.ok) {
    console.error(`HTTP ${res.status}`);
    process.exit(1);
  }
  const html = await res.text();
  console.error(`Received ${html.length} bytes`);

  let bounties: ScrapedBounty[] = [];

  // Strategy A: __NEXT_DATA__
  const nextDataMatch = html.match(
    /<script[^>]+id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/
  );
  if (nextDataMatch) {
    try {
      const json = JSON.parse(nextDataMatch[1]);
      writeFileSync("./algora-page.json", JSON.stringify(json, null, 2));
      console.error("Wrote __NEXT_DATA__ payload to algora-page.json");
      walkForBounties(json, bounties);
      bounties = dedupe(bounties);
      console.error(`Extracted ${bounties.length} bounties from __NEXT_DATA__`);
    } catch (e) {
      console.error("Found __NEXT_DATA__ but JSON.parse failed:", e);
    }
  } else {
    console.error("No __NEXT_DATA__ tag found (probably client-rendered).");
  }

  // Strategy B: extract org handles from anchor hrefs (for config seeding)
  const orgPattern = /href="\/([\w-]+)\/bounties[?/"]/g;
  const orgs = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = orgPattern.exec(html)) !== null) {
    const handle = m[1];
    if (["api", "docs", "_next", "static", "console"].includes(handle)) continue;
    orgs.add(handle);
  }

  // Strategy C: raw github issue refs (fallback if walker found nothing)
  const issuePattern =
    /https:\/\/github\.com\/([\w.-]+)\/([\w.-]+)\/issues\/(\d+)/g;
  const issues = new Set<string>();
  while ((m = issuePattern.exec(html)) !== null) {
    issues.add(`https://github.com/${m[1]}/${m[2]}/issues/${m[3]}`);
  }

  if (bounties.length === 0 && issues.size > 0) {
    console.error(`Walker empty; falling back to raw issue list (no $ amounts).`);
    bounties = [...issues].map((u) => ({ amount: 0, url: u }));
  }

  writeFileSync("./bounties.json", JSON.stringify(bounties, null, 2));
  console.error(`Wrote ${bounties.length} bounties to bounties.json`);

  console.log("\n=== Org handles found in HTML ===");
  for (const o of [...orgs].sort()) console.log(`  ${o}`);
  console.log(`\n=== Top bounties (by $) ===`);
  for (const b of [...bounties].sort((a, b) => b.amount - a.amount).slice(0, 15)) {
    console.log(`  $${b.amount}\t${b.title ?? "(no title)"}\t${b.url}`);
  }
  if (bounties.length === 0) {
    console.log(`\nNothing extracted. Page is likely client-rendered.`);
    console.log(`Open ${url} in a browser, View Source, search __NEXT_DATA__.`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
