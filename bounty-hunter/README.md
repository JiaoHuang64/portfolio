# bounty-hunter

Two scripts that turn the manual Algora-bounty workflow into a repeatable loop.

- `discover` — pulls open bounties from a configured list of Algora orgs, scores them, prints the top N
- `attempt` — given an issue URL, forks the repo, creates a working branch, drops a BOUNTY.md and prints the next-step commands

## Setup

```bash
cd bounty-hunter
npm install
cp config.example.json config.json   # edit orgs / score weights to taste
```

Prereqs on the host running this:
- Node 20.11+ (native `fetch`)
- `gh` CLI, authenticated as the GitHub account you want PRs to come from
- An Algora account with Stripe Connect or Alipay configured for payouts

## Use

```bash
npm run discover                       # ranked candidate list to stdout
npm run discover -- --json > today.json
npm run discover -- --debug            # dump raw API response to stderr

npm run attempt -- https://github.com/<owner>/<repo>/issues/<n>
```

`attempt` forks into `./workspace/<owner>-<repo>` and checks out `bounty/issue-<n>`.
Drive the actual fix with Claude Code from that directory, then push + open a PR
with `/claim #<n>` in the body (Algora picks it up automatically).

## Limits / gotchas

- The Algora API requires an `org` parameter — there is no public global enumeration.
  Maintain the org list in `config.json`. Seed it from interesting projects on
  [algora.io/bounties](https://algora.io/bounties).
- The tRPC endpoint format is undocumented and may shift. If `discover` returns
  0 items across all orgs, run with `--debug` and inspect the raw payload.
- Don't fully automate PR submission. Per-bounty human review is what keeps the
  PR-merge rate respectable (~40% in published case studies; lower without review).
- Avoid projects that have explicit "no AI PRs" policies (curl, CPython, Linux
  kernel, several Apache projects).
