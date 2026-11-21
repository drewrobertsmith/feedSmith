# Decision log

The single source of truth for this app's decisions. Read the relevant section before designing anything. A decision that changes is **superseded** by a new row that names the old one; rows are never rewritten.

| ID | Decision | Why |
|---|---|---|
| T1 | **Dev loop** (2026-11-21): every change goes through the expo-dev-loop plugin's `/expo-dev-loop:feature`: plan against this log, test first, build, review (composition, React Native performance, React Doctor, security), verify on iOS and Android across the screen's state table, and log. The Stop hook enforces the gates and review skills in `.claude/expo-dev-loop.json`. | A repeatable loop, with gates the agent can't skip, makes an agent's "done" checkable. |
| T2 | **Branching** (2026-11-21): `develop` integrates and `main` is what's released. Feature, fix and chore branches come off `develop` and go back by PR (squash-merged). Hotfixes come off `main`, go back by PR and are tagged, then back-merged into `develop`. A release is a PR from `develop` into `main`, merged with a merge commit and tagged. A person merges every PR. The expo-dev-loop branch guard blocks commits and pushes to both branches, and GitHub branch protection holds for everyone. | Released code stays separate from work in progress, and every change to either branch is reviewed by a person. |
