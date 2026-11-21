# Issue tracker: Linear

Issues and specs for this repo live in Linear, team `FeedSmith` (issue key `FEE`, e.g. `FEE-123`). Use the Linear MCP server (`https://mcp.linear.app/mcp`) for all operations. If its tools aren't available, stop and ask the user to connect it — do not fall back to local files.

## Conventions

- **Create an issue**: create in team `FeedSmith` with a title and markdown description.
- **Read an issue**: fetch by identifier (`FEE-123`), including labels and comments.
- **List issues**: list team issues, filtered by label and state.
- **Make an issue a sub-issue of a parent**: create the child with `parentId` set to the parent issue.
- **Comment on an issue**: add a comment to the issue.
- **Apply / remove labels**: add/remove workspace labels (see `triage-labels.md`).
- **Close**: move to a Done-type state (Canceled for `wontfix`) with a closing comment.

## When a skill says "publish to the issue tracker"

Create a Linear issue in team `FeedSmith`.

## When a skill says "fetch the relevant ticket"

Read it as in **Read an issue** above.

## Wayfinding operations

Used by `/wayfinder`. The **map** is a single parent issue with **child** sub-issues as tickets.

- **Map**: a parent issue labelled `wayfinder:map`, holding the Notes / Decisions-so-far / Fog body.
- **Child ticket**: a sub-issue of the map, labelled `wayfinder:<type>` (`research`/`prototype`/`grilling`/`task`). Once claimed, assigned to the driving dev.
- **Blocking**: Linear's native "blocked by" issue relations. A ticket is unblocked when every blocker is in a completed/canceled state.
- **Frontier query**: list the map's open sub-issues, drop any with an open blocker or an assignee; first in map order wins.
- **Claim**: assign the issue to yourself — the session's first write.
- **Resolve**: comment with the answer, move to Done, then append a context pointer (gist + link) to the map's Decisions-so-far.
