# Security triage

Findings from rnsec (`security`, `security:full`), the dependency audit and any security review, each with its verdict. rnsec silences rules only project-wide, so findings are triaged here instead of silenced.

## Scanner findings

| Date | Tool | Rule / advisory | Where | Verdict | Why |
|---|---|---|---|---|---|
| 2026-11-21 | bun audit | GHSA-g3hv-75wg-m249 (minimatch, moderate ReDoS) | via eslint, jest, jest-expo, expo › @expo/fingerprint | accepted risk (proposed; needs owner sign-off) | Dev and build-time tooling only, not in the app bundle; patterns come from the repo's own config. Review again 2027-02-21 or at the next SDK upgrade. |
| 2026-11-21 | bun audit | GHSA-3g3m-2fjr-6pw4 (glob, moderate) | via jest, jest-expo | accepted risk (proposed; needs owner sign-off) | Test tooling only, run locally on the repo's own files. Review again 2027-02-21 or at the next SDK upgrade. |

Verdicts: **fixed**, **false positive**, **accepted risk** (with the reason and who accepted it).

## Trusted install scripts

Every dependency allowed to run lifecycle scripts (bun `trustedDependencies`, pnpm `onlyBuiltDependencies`), with the version and what its script does.

| Package | Version | Script reviewed | Notes |
|---|---|---|---|

None. `trustedDependencies` is empty, so bun blocks every lifecycle script. `@parcel/watcher@2.6.0` (`node scripts/build-from-source.js`) is blocked and not needed: everything works with its prebuilt binary.

## Personal data the app holds

| Data | Where it's stored | Purpose | Retention | How it's deleted |
|---|---|---|---|---|
