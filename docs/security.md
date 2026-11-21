# Security triage

Findings from rnsec (`security`, `security:full`), the dependency audit and any security review, each with its verdict. rnsec silences rules only project-wide, so findings are triaged here instead of silenced.

## Scanner findings

| Date | Tool | Rule / advisory | Where | Verdict | Why |
|---|---|---|---|---|---|
| 2026-11-21 | bun audit | GHSA-g3hv-75wg-m249 (minimatch, moderate ReDoS) | via eslint, jest, jest-expo, expo › @expo/fingerprint | accepted risk (Drew Smith, 2026-11-21) | Dev and build-time tooling only, not in the app bundle; patterns come from the repo's own config. Review again 2027-02-21 or at the next SDK upgrade. |
| 2026-11-21 | bun audit | GHSA-3g3m-2fjr-6pw4 (glob, moderate) | via jest, jest-expo | accepted risk (Drew Smith, 2026-11-21) | Test tooling only, run locally on the repo's own files. Review again 2027-02-21 or at the next SDK upgrade. |
| 2026-11-21 | rnsec | `security:full` after FEE-18 (native config, the `feedsmith://gallery` deep link, new dependencies) | whole app | no findings | The gallery route is guarded twice: `Stack.Protected guard={__DEV__}` and a route that loads the gallery only when `__DEV__` is true (tested with `__DEV__` false). |
| 2026-11-21 | review | New dependencies in FEE-18: `uniwind@1.13.2`, `tailwindcss@4.3.5`, `@expo-google-fonts/instrument-sans@0.4.2`, `@expo-google-fonts/literata@0.4.3`, `@types/node@26.6.6` (dev) | package.json | accepted | Pinned exact, each released over two weeks before install (Uniwind 1.14.0 was four days old, so 1.13.2). No lifecycle scripts approved. Fonts are bundled files under the OFL; nothing is fetched at runtime and none of them send data (Q13). |

Verdicts: **fixed**, **false positive**, **accepted risk** (with the reason and who accepted it).

## Trusted install scripts

Every dependency allowed to run lifecycle scripts (bun `trustedDependencies`, pnpm `onlyBuiltDependencies`), with the version and what its script does.

| Package | Version | Script reviewed | Notes |
|---|---|---|---|

None. `trustedDependencies` is empty, so bun blocks every lifecycle script. `@parcel/watcher@2.6.0` (`node scripts/build-from-source.js`) is blocked and not needed: everything works with its prebuilt binary.

## Personal data the app holds

| Data | Where it's stored | Purpose | Retention | How it's deleted |
|---|---|---|---|---|
