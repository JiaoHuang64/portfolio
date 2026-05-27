import { writeFileSync } from "node:fs";

const url = process.argv[2] ?? "https://algora.io/bounties";

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

  // Strategy A: __NEXT_DATA__
  const nextDataMatch = html.match(
    /<script[^>]+id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/
  );
  if (nextDataMatch) {
    try {
      const json = JSON.parse(nextDataMatch[1]);
      writeFileSync("./algora-page.json", JSON.stringify(json, null, 2));
      console.error("Wrote __NEXT_DATA__ payload to algora-page.json");
    } catch (e) {
      console.error("Found __NEXT_DATA__ but JSON.parse failed:", e);
    }
  } else {
    console.error("No __NEXT_DATA__ tag found (probably client-rendered).");
  }

  // Strategy B: extract org handles from anchor hrefs
  // Algora uses /<org>/bounties for org bounty pages.
  const orgPattern = /href="\/([\w-]+)\/bounties[?/"]/g;
  const orgs = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = orgPattern.exec(html)) !== null) {
    const handle = m[1];
    // skip obvious non-orgs
    if (["api", "docs", "_next", "static", "console"].includes(handle)) continue;
    orgs.add(handle);
  }

  // Strategy C: any github.com/<owner>/<repo>/issues/<n> referenced
  const issuePattern =
    /https:\/\/github\.com\/([\w.-]+)\/([\w.-]+)\/issues\/(\d+)/g;
  const issues = new Set<string>();
  while ((m = issuePattern.exec(html)) !== null) {
    issues.add(`${m[1]}/${m[2]}#${m[3]}`);
  }

  // Strategy D: any visible $amount near bounty text
  const dollarPattern = /\$(\d{2,4})/g;
  const amounts: number[] = [];
  while ((m = dollarPattern.exec(html)) !== null) {
    amounts.push(Number(m[1]));
  }

  console.log("\n=== Org handles found in HTML ===");
  for (const o of [...orgs].sort()) console.log(`  ${o}`);
  console.log(`\n=== GitHub issues referenced (${issues.size}) ===`);
  for (const i of [...issues].slice(0, 30)) console.log(`  ${i}`);
  if (issues.size > 30) console.log(`  ... (+${issues.size - 30} more)`);
  console.log(`\n=== Dollar amounts seen (sample) ===`);
  console.log(`  count=${amounts.length}, top=${[...new Set(amounts)].sort((a, b) => b - a).slice(0, 10).join(", ")}`);
  console.log(`\nIf the lists above are empty, the page is client-rendered.`);
  console.log(`Open ${url} in a browser and copy org handles manually into config.json.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
