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

**The lighter loop (D37, standing since D42).** The owner merges without reading PRs, and what goes wrong is an implementation the owner doesn't like the look of, not a bug a reviewer would find. So these win over the rest of this section and over the skill:

- **Kept:** tests first (world tests typed by world ID), the gates, the state table and gallery, the visual check with every difference read before approving, motion frame by frame, the emulator rules, the decision log.
- **Taste, guaranteed:** every UI ticket plans with `design-with-taste` (the Stop hook requires it) and checks the design against it before building.
- **The owner's look:** every UI ticket, deletions included, shows the owner a capture of what changed before any picture is approved.
- **Plan:** load other skills only for an area or API this session hasn't touched yet; no fan-out by default.
- **Review:** no reviewer agents and no separate quality-bar walk. The quality bar still decides which tests and device checks the plan includes.
- **No screen changed:** skip Verify's device steps.
- **Writing:** the PR body is one line, the ticket link, and "Not seen" and "Needs your call" when there are any; no Linear note, just move the ticket to In Review. The hand-off to the owner carries only those two lists. Decision entries: three sentences at most.
- **Add-backs:** when something deleted here turns out to be needed, add it back and log it in D37's add-back line, as a fact, not a failure.

- **Android only.** Verify on Android; skip every iOS step (T3). Say "iOS: skipped (Android-only v1)" in the hand-off.
- **No translation.** feedSmith has no Lingui or other localisation; skip the pseudo-locale captures and the Lingui steps.
- **Emulator first.** Verify on an Android emulator with agent-device (`android-emulator` skill). Use the owner's Pixel 10 only for what an emulator can't show (the performance budgets in `docs/quality-bar.md`, haptics), and only when the owner says it's plugged in. Leave the emulator (the `Pixel_10` AVD) running when Verify ends, even if this session booted it; the skill's "shut down when you finish" step doesn't apply here. If it isn't running, boot it detached and reuse it. Do reset any settings changed for checks (dark mode, font size, display size, animation scales) so the next feature starts from defaults.
- **Design reference.** Every UI ticket reads `docs/design-references/todoist.md` while planning (step 1.5) and checks the design against it in Review. Quality bar items Q29, Q30, Q32 and Q34 come from it (D16). It's a reference for structure and behaviour, not look.
- **State gallery.** Every UI ticket adds its screen's worlds to the world catalog and the dev-only state gallery (its deep link is `stateGallery` in `.claude/expo-dev-loop.json`), and walks them there in Verify.
- **Visual check (T34).** Every UI ticket runs `bun run visual:check` in Verify, with the debug build running against Metro on the emulator. It captures every gallery world in dark and light, each once it says it's ready (about 2½ minutes; name world IDs to check only those; T47) and compares each with its approved picture in `test/visual/approved/`. Read every difference in `.visual-check/diff/` (changed pixels in red): each must be one the ticket meant. Scrolled arrival worlds and Account sheet worlds sometimes land a pixel off (a whole-list shift, or the sheet); re-run those before reading more into it. Then approve exactly those worlds with `bun run visual:approve <world-id …>` (or `--all` when the whole app changed on purpose) and commit the pictures with the change. A check never approves anything. New worlds show as "new" until approved. The hand-off lists the worlds whose pictures changed. It isn't a CI gate, since it needs the emulator.
- **Motion, frame by frame (T34).** Any ticket that adds or changes motion is watched slowly before review, since the bugs hide in the in-between frames: a chip that hops a few points, a frame where everything has faded out, two things in one place. Slow the motion about 10× by temporarily editing `src/theme/motion.ts` (durations, delays and exits ×10; springs: `stiffness` ÷100 and `damping` ÷10, which keeps their shape), never committed. Then capture a burst while triggering it: `mkdir -p .visual-check/frames; for i in $(seq 40); do adb exec-out screencap -p > .visual-check/frames/$i.png; done`. `adb screenrecord` drops most frames on the emulator. Read the frames in order. Feedback names the knob: delay, duration or easing. Put the tokens back, and check the Remove animations form too.
- **Convex.** A change under `convex/` plans with the `convex` skill and the relevant `convex-*` skills (`convex-design`, `convex-auth`, `convex-crons`, …), tests through `convex-test` (`convex-test` skill), and in Review also runs `convex-reviewer`, plus `convex-authz` when it adds or changes a public function.
- **Effect.** Code that uses Effect follows the `effect-ts` skill when it's planned, built and reviewed.

## Reading Convex's source

Convex isn't vendored: its npm packages already ship their TypeScript source at the exact installed version. For an exact Convex API signature or behaviour, read it there rather than guessing, even though `node_modules` is gitignored:

- `node_modules/convex/src/`: the server API (`server/`), validators (`values/`), the React client (`react/`).
- `node_modules/@convex-dev/auth/src/` and `node_modules/@convex-dev/rate-limiter/src/`: the components feedSmith uses.
- `node_modules/convex-test/dist/`: compiled JavaScript only, still readable.

For patterns (limits, indexes, auth checks), the `convex` skills come first; for the live deployment (functions, data, logs), use the Convex MCP tools.

## Learning more about Effect

This repository uses the Effect Typescript library. Its source, at the exact version installed, is vendored in `repos/effect/` (T38).

Before writing any Effect code, first read `repos/effect/LLMS.md` **completely**, and follow the links in it when required.

Then treat `repos/effect/` as the source of truth for Effect patterns: before using an API, read its module in `repos/effect/packages/effect/src/` and how its tests use it in `repos/effect/packages/effect/test/`. Topic guides sit beside them (`SCHEMA.md`, `CONFIG.md`, `HTTPAPI.md`, …), and `repos/effect/ai-docs/` holds worked examples. Prefer what you find there over memory, web search or `node_modules`.

### House rules (T44)

- Convex is the core: storage, transactions, scheduling, live queries, auth. Effect owns the messy edge: fetching, parsing untrusted content, retries, deadlines, cancelling.
- Effect programs live in `convex/lib/`; Convex functions are thin shells that run them (`Effect.runPromise(… .pipe(Effect.provide(…)))`).
- Each outside dependency is one service (today `FeedHttp`). Typed errors become the reasons Users see in one place (`REASONS` in `convex/lib/feed/fetch.ts`).
- Decode untrusted JSON with `Schema`; keep expected failures typed and handle defects apart (`Effect.catchDefect`).
- Run server programs on `ServerLayer` and log only with `Effect.log*` (annotate ids, never URLs): its logger scrubs URLs from every line (T45, Q9). Lint forbids `console` in `convex/lib/feed/`.
- Never wrap Convex queries, mutations or crons in Effect, never replace Convex validators with Schema, and never use Effect in the app (`src/`). Lint refuses `effect` in `src/` and any import from `repos/`.

## Vendored repositories

- External repositories are vendored under `repos/` (Effect's first added with `git subtree --squash`; updated by `bun run repos:effect`). They're read-only reference material for working with those libraries.
- Prefer their examples and patterns over generated guesses or web search results.
- Never edit files under `repos/` unless the owner asks, and never import from `repos/`: app code keeps importing the installed packages.
- Each one is pinned to the version in `package.json`. After bumping `effect`, run `bun run repos:effect` so the source matches, and commit what it stages with the bump.
