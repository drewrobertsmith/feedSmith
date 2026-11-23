This is an Expo/React Native mobile application. Prioritize mobile-first patterns, performance, and cross-platform compatibility.

## Expo has changed — do not trust your training data

Expo ships breaking changes every SDK release. APIs you remember are likely renamed, moved, or removed. Before writing any code that touches an Expo, EAS, or React Native API:

1. Read the major version of the `expo` package in `package.json`.
2. Fetch the matching versioned docs: `https://docs.expo.dev/versions/v<major>.0.0/`
3. For anything else, fetch https://docs.expo.dev/llms.txt — an index of all Expo docs with corrections to common LLM misconceptions. Follow its links to the specific page you need; never answer from memory.

## Commands

Use `bunx` instead of `npx` if the project uses bun (`bun.lock` present).

```bash
npx expo install <package>  # ALWAYS use instead of npm/yarn/pnpm/bun add — resolves SDK-compatible versions
npx expo start              # start the dev server
npx expo lint               # lint
npx tsc --noEmit            # typecheck
npx expo-doctor             # diagnose dependency and config issues
npx expo install --fix      # fix incompatible package versions
```

Run lint and typecheck before declaring any task done.

## Navigation & Routing

- Use **Expo Router** for all navigation. Routes live in `src/app/` — every file there is a screen, `_layout.tsx` files define navigators. Keep non-route code (components, hooks, utils) outside `src/app/`.
- Import `Link`, `router`, and `useLocalSearchParams` from `expo-router`.
- Docs: https://docs.expo.dev/router/introduction.md

## Building with EAS

Use EAS to build, sign, and submit the app in the cloud (`eas build`, `eas submit`) and to ship over-the-air updates (`eas update`) — no local Xcode or Android Studio required. Run EAS CLI as `bunx eas-cli <command>` in Bun projects, or `npx eas-cli@latest <command>` otherwise; substitute that for bare `eas` in docs examples.
Docs: https://docs.expo.dev/eas/index.md

## Rules

- If `ios/` and `android/` directories do not exist, they are generated (Continuous Native Generation). Never create or edit them by hand — configure native behavior in `app.json` and config plugins.
- Expo Go only includes its bundled native modules. After adding a library with native code, the app needs a development build: `npx expo run:ios|android` locally, or `eas build --profile development`.
- Prefer recommended Expo modules over third-party libraries, and check your available skills before adding dependencies. Docs: https://docs.expo.dev/versions/latest/index.md

## Agent skills

### Issue tracker

Issues are tracked in Linear (team `FeedSmith`, key `FEE`) via the Linear MCP server. See `docs/agents/issue-tracker.md`.

### Triage labels

Default vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: root `GLOSSARY.md` + one decision log, `docs/decisions.md`. See `docs/agents/domain.md`.

## Dev loop (expo-dev-loop)

This project uses the expo-dev-loop plugin: `/expo-dev-loop:feature` for every change, gates and required review skills in `.claude/expo-dev-loop.json`, enforced by its Stop hook. Decisions live in `docs/decisions.md`. What the app must never get wrong lives in `docs/quality-bar.md`, built and revised with `/expo-dev-loop:quality-bar`.

### How feedSmith runs the loop

These adapt `/expo-dev-loop:feature` to this app. Where they differ from the skill, they win.

- **Android only.** Verify on Android; skip every iOS step (T3). Say "iOS: skipped (Android-only v1)" in the hand-off.
- **No translation.** feedSmith has no Lingui or other localisation; skip the pseudo-locale captures and the Lingui steps.
- **Emulator first.** Verify on an Android emulator with agent-device (`android-emulator` skill). Use the owner's Pixel 10 only for what an emulator can't show (the performance budgets in `docs/quality-bar.md`, haptics), and only when the owner says it's plugged in. Leave the emulator (the `Pixel_10` AVD) running when Verify ends, even if this session booted it; the skill's "shut down when you finish" step doesn't apply here. If it isn't running, boot it detached and reuse it. Do reset any settings changed for checks (dark mode, font size, display size, animation scales) so the next feature starts from defaults.
- **Design reference.** Every UI ticket reads `docs/design-references/todoist.md` while planning (step 1.5) and checks the design against it in Review. Quality bar items Q29–Q35 come from it (D16). It's a reference for structure and behaviour, not look.
- **State gallery.** Every UI ticket adds its screen's worlds to the world catalog and the dev-only state gallery (its deep link is `stateGallery` in `.claude/expo-dev-loop.json`), and walks them there in Verify.
- **Convex.** A change under `convex/` plans with the `convex` skill and the relevant `convex-*` skills (`convex-design`, `convex-auth`, `convex-crons`, …), tests through `convex-test` (`convex-test` skill), and in Review also runs `convex-reviewer`, plus `convex-authz` when it adds or changes a public function.
- **Effect.** Code that uses Effect follows the `effect-ts` skill when it's planned, built and reviewed.
- **Three-axis code review.** Work is always ticketed, so Review step 4.6 always runs. `mattpocock-skills:code-review` runs three `reviewer` agents in parallel, not two, all on the same diff (`origin/<base>...HEAD`):
  - **Spec** lists every acceptance criterion in the ticket, or every requirement if the ticket has no acceptance-criteria section. Each one gets a verdict: met, partial, missing or wrong, with `path:line` evidence and the ticket line quoted. Scope creep and, for UI tickets, the state-table coverage come after that list.
  - **Standards** works as the skill describes, but without the quality bar. That belongs to the third axis.
  - **Quality bar** reads `docs/quality-bar.md`, picks the items whose "Applies to" column matches this ticket (`every change` items always apply), and gives each one a verdict: pass, fail, or "needs device check" when its "Checked by" column names a device check. Each verdict comes with `path:line` evidence or the test that proves it, and the report stays under 400 words.
  - Report the three axes side by side under `## Spec`, `## Standards` and `## Quality bar`, without merging or reranking them. Step 4.7 starts from the Quality bar report: fix each fail, and carry each "needs device check" item into Verify.

## Learning more about Effect

This repository uses the Effect Typescript library.

Before writing any Effect code, first read `node_modules/effect/AGENTS.md`
**completely**, and follow the links in the file when required.

If you need to learn more about particular Effect apis and concepts that the
guide doesn't cover, search through the source code in `node_modules/effect/src`.
