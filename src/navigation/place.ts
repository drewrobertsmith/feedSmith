import { AppState } from 'react-native';

/**
 * Where you are (FEE-130, Q4): the chip (a Feed's id, or none for All), the Article you're reading, and how far
 * down the list and the Article you've scrolled. Only the route and offsets: never tokens or Article text (T6).
 */
export type Place = { feed?: string; article?: string; listOffset: number; articleOffset: number };

/** Where a place is kept on the phone: read once at start, written only when the app leaves the screen. */
export type PlaceStore = { read: () => string | null; write: (value: string) => void };

/** A Feed's or Article's id is short, lowercase letters and digits, as the routes accept (Q25). */
const ID = /^[a-z0-9]{1,64}$/;
/** Further than any list or Article scrolls: a larger offset is garbage, and starts at the top. */
const MAX_OFFSET = 1_000_000;

const offset = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= MAX_OFFSET ? value : 0);
const id = (value: unknown) => (typeof value === 'string' && ID.test(value) ? value : undefined);

/**
 * A place read back from the phone (Q25): whatever's there is untrusted, so only the known shape survives. An id
 * that isn't one is dropped (All, or Feeds instead of an Article), and an offset that isn't sane starts at the top.
 */
export function parsePlace(raw: string | null): Place | null {
  if (raw === null) return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const stored = value as Record<string, unknown>;
  const place: Place = { listOffset: offset(stored.listOffset), articleOffset: offset(stored.articleOffset) };
  const feed = id(stored.feed);
  const article = id(stored.article);
  if (feed) place.feed = feed;
  if (article) place.article = article;
  return place;
}

/**
 * Keeps your place (FEE-130): `restored` is what the phone held at start, read once, synchronously, so the
 * screens open there on their first frame. Screens `update` it as you move, in memory only; it's written to
 * the phone once each time the app leaves the screen (Q21), by the one listener `start` adds and returns the
 * cleanup for (Q20).
 */
export function createPlaceKeeper(store: PlaceStore) {
  const restored = parsePlace(store.read());
  let current: Place = restored ?? { listOffset: 0, articleOffset: 0 };
  let articleTaken = false;
  let articleShown = false;
  return {
    restored,
    /** The Article to open again, once (in an effect): signing in again later starts on Feeds. */
    takeRestoredArticle(): string | undefined {
      if (articleTaken) return undefined;
      articleTaken = true;
      return restored?.article;
    },
    /** Where the restored Article opens, until it's been shown once; any other Article opens at the top. */
    restoredArticleOffset(id: string): number {
      return !articleShown && restored?.article === id ? restored.articleOffset : 0;
    },
    /** Whether this Article is the one the phone held, until it's been shown: a gone one falls back to Feeds. */
    isRestoredArticle(id: string): boolean {
      return !articleShown && restored?.article === id;
    },
    /** The restored Article has been shown: from now on every Article opens at the top. */
    articleShown() {
      articleShown = true;
    },
    update(change: Partial<Place>) {
      current = { ...current, ...change };
    },
    start() {
      const subscription = AppState.addEventListener('change', (state) => {
        if (state === 'background') {
          const { article, ...rest } = current;
          store.write(JSON.stringify(article ? current : rest));
        }
      });
      return () => subscription.remove();
    },
  };
}

export type PlaceKeeper = ReturnType<typeof createPlaceKeeper>;

/** A store in memory: a world's, or a test's, with what it starts holding and how often it was written. */
export function memoryPlaceStore(initial: string | null = null): PlaceStore & { writes: number } {
  let value = initial;
  const store = {
    writes: 0,
    read: () => value,
    write: (next: string) => {
      value = next;
      store.writes += 1;
    },
  };
  return store;
}
