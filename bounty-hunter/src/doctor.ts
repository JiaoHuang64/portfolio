import { execSync } from "node:child_process";
import { existsSync, accessSync, constants } from "node:fs";
import { resolve } from "node:path";

type Check = { name: string; ok: boolean; detail: string; fatal: boolean };

const checks: Check[] = [];

function add(name: string, ok: boolean, detail: string, fatal = false) {
  checks.push({ name, ok, detail, fatal });
}

function shTry(cmd: string): string | null {
  try {
    return execSync(cmd, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return null;
  }
}

// node version
const [maj, min] = process.versions.node.split(".").map(Number);
const nodeOk = maj > 20 || (maj === 20 && min >= 11);
add("node >= 20.11", nodeOk, `have ${process.versions.node}`, true);

// gh present + authenticated
const ghVersion = shTry("gh --version");
add("gh CLI installed", !!ghVersion, ghVersion?.split("\n")[0] ?? "not found", true);

if (ghVersion) {
  const ghAuth = shTry("gh auth status 2>&1");
  const authed = ghAuth?.includes("Logged in to github.com") ?? false;
  add(
    "gh authenticated",
    authed,
    authed ? (ghAuth?.split("\n").find((l) => l.includes("account")) ?? "") : "run `gh auth login`",
    true
  );

  if (authed) {
    const me = shTry("gh api user -q .login");
    add("gh user resolvable", !!me, me ?? "(no login)");

    // confirm token has scopes we need: repo, workflow (for forking + branch push)
    const scopes = shTry("gh auth status 2>&1 | grep -i 'token scopes'");
    const hasRepo = scopes?.includes("'repo'") ?? scopes?.includes("repo") ?? false;
    add(
      "gh token has 'repo' scope",
      hasRepo,
      scopes ?? "could not read scopes",
      false
    );
  }
}

// config.json
const cfgPath = resolve(process.cwd(), "config.json");
const cfgExists = existsSync(cfgPath);
add("config.json present", cfgExists, cfgExists ? cfgPath : "cp config.example.json config.json", false);

// cwd writable (for attempts.jsonl + bounties.json)
try {
  accessSync(process.cwd(), constants.W_OK);
  add("cwd writable", true, process.cwd());
} catch {
  add("cwd writable", false, `cannot write to ${process.cwd()}`, true);
}

// workspace dir
const workdir = resolve(process.env.BOUNTY_WORKDIR ?? "./workspace");
add(
  "workspace dir",
  true,
  existsSync(workdir) ? `${workdir} (exists)` : `${workdir} (will be created on first attempt)`,
  false
);

// network: can we reach github API?
const ghApiOk = shTry("gh api rate_limit -q .rate.remaining");
if (ghApiOk) {
  const remaining = Number(ghApiOk);
  add(
    "github API reachable",
    true,
    `${remaining} requests remaining this hour`,
    false
  );
  if (remaining < 100) {
    add(
      "github API quota",
      false,
      `only ${remaining} left — gh-search will burn ~6 requests, status burns ~3/attempt`,
      false
    );
  }
} else {
  add("github API reachable", false, "gh api failed", true);
}

// print
const pad = Math.max(...checks.map((c) => c.name.length));
let anyFatal = false;
for (const c of checks) {
  const mark = c.ok ? "ok " : c.fatal ? "ERR" : "warn";
  if (!c.ok && c.fatal) anyFatal = true;
  console.log(`${mark}  ${c.name.padEnd(pad)}  ${c.detail}`);
}

const failed = checks.filter((c) => !c.ok);
console.log(
  `\n${checks.length - failed.length}/${checks.length} ok` +
    (failed.length ? `, ${failed.filter((c) => c.fatal).length} fatal` : "")
);
process.exit(anyFatal ? 1 : 0);
