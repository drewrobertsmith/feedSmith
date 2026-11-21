# Security triage

Findings from rnsec (`security`, `security:full`), the dependency audit and any security review, each with its verdict. rnsec silences rules only project-wide, so findings are triaged here instead of silenced.

## Scanner findings

| Date | Tool | Rule / advisory | Where | Verdict | Why |
|---|---|---|---|---|---|

Verdicts: **fixed**, **false positive**, **accepted risk** (with the reason and who accepted it).

## Trusted install scripts

Every dependency allowed to run lifecycle scripts (bun `trustedDependencies`, pnpm `onlyBuiltDependencies`), with the version and what its script does.

| Package | Version | Script reviewed | Notes |
|---|---|---|---|

## Personal data the app holds

| Data | Where it's stored | Purpose | Retention | How it's deleted |
|---|---|---|---|---|
