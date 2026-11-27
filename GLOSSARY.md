# feedSmith

A personal, minimal RSS reader with a place to keep articles for later. It exists to make reading websites' feeds calm and focused, without algorithms, folders or clutter.

## Language

**User**:
A person signed in to feedSmith. Each User's Feeds, Saved Articles and Read state are their own.
_Avoid_: Member, subscriber, owner (when meaning any User)

**Account**:
A User's Google sign-in and everything feedSmith keeps for them. Deleting an Account removes all of it.
_Avoid_: Profile, settings (when meaning the Account)

**Feed**:
One website's RSS or Atom feed that you follow.
_Avoid_: Source, channel, subscription, site

**Not updating**:
A Feed that has failed every try for a day (FEE-126, FEE-127): its chip carries a badge, and its page says since when and why, with fixes: **Try again** (fetch it now, FEE-128), **New address** (the same Feed, with its name and Articles, at the address it moved to, FEE-129), Open site, then Remove. Its Articles stay.
_Avoid_: Broken, dead, failing (in the app's words), error

**Article**:
One entry published in a Feed.
_Avoid_: Item, entry, post, story

**Subtitle**:
The short line a Feed gives under an Article's title.
_Avoid_: Summary, excerpt, dek, description

**Pinned**:
One of up to three Feeds you have chosen to keep first, right after All.
_Avoid_: Favorite, starred, priority

**Pinned** (the view):
Your Pinned Feeds' Articles together, newest first, chosen by the Pinned chip. A view to read, not a folder.
_Avoid_: Favorites, group, folder

**All**:
Every Article from every Feed together, newest first.
_Avoid_: Latest, stream, timeline, home, the feed

**Read**:
An Article you have opened.
_Avoid_: Seen, viewed, opened

**Saved**:
An Article you have marked to read later.
_Avoid_: Bookmarked, read later list, favorite, starred

**Done**:
A Saved Article you have finished, which leaves Saved.
_Avoid_: Archived, completed, dismissed

**Reading view**:
An Article's text and images, extracted from its web page and shown in feedSmith's own clean layout.
_Avoid_: Reader mode, article view, web view
