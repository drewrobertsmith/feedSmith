import { useState, useSyncExternalStore } from 'react';
import { Uniwind } from 'uniwind';

import type { Account, Auth } from '@/auth/auth-context';
import type { SignInView } from '@/auth/sign-in-outcome';
import type { Environment } from '@/environment';
import type { Connection } from '@/feeds/connection';
import { memoryPlaceStore, type Place } from '@/navigation/place';
import { usePull } from '@/feeds/use-pull';
import { isAddress, type AddFeedReason, type AddFeedView, type AddOutcome, type ArticleRow, type ArticleView, type FeedChip, type FeedsData, type FetchFailure } from '@/feeds/feeds-data';
import {
  FIXTURE_ACCOUNT,
  FIXTURE_ARTICLE,
  FIXTURE_ADDED_CHIP,
  FIXTURE_ARRIVED_ROWS,
  FIXTURE_CHIPS,
  FIXTURE_CHOICES,
  FIXTURE_LAST_UPDATED_AGO,
  FIXTURE_EXTRACTING_ARTICLE,
  FIXTURE_LONG_FEED_ARTICLE,
  FIXTURE_MANY_CHIPS,
  FIXTURE_NO_AUTHOR_ARTICLE,
  FIXTURE_NO_LEAD_IMAGE_ARTICLE,
  FIXTURE_NOW,
  FIXTURE_OMITTED_ARTICLE,
  FIXTURE_READ_ROWS,
  FIXTURE_ROWS,
  FIXTURE_BUSY_ROWS,
  FIXTURE_KEPT_ROWS,
  FIXTURE_SEVERAL_AUTHORS_ARTICLE,
  FIXTURE_UNEXTRACTED_ARTICLE,
} from '@/worlds/fixtures';
import type { ThemeName } from '@/theme/tokens';
import { accountInitial } from '../../convex/lib/account';

/**
 * One state the app can be in, as plain data (T13). Later tickets extend it with their
 * own axes (signed in or out, network, fixture Feeds…), reached through the real modules.
 */
export type WorldSpec = {
  colorScheme: ThemeName;
  reduceMotion?: boolean;
  /** Android's largest font size is 2.0. */
  fontScale?: number;
  /** The screen the world opens on. */
  section?: 'feeds' | 'add-feed' | 'article';
  /** Where the User is in signing in. Defaults to signed in. */
  auth?: 'signed-in' | 'signed-out' | 'signing-in' | 'not-allowed' | 'failed';
  /** The signed-in User's Account. `no-name`: Google gave no name, so the email stands in. */
  account?: 'no-name';
  /** The Account sheet starts open (the state gallery; tests tap the circle). */
  accountSheet?: 'open';
  /** Signing out: `busy` is under way; `no-server` can't reach the server, and signs out anyway. */
  signOut?: 'busy' | 'no-server';
  /** Deleting the Account: `busy` is under way; `failed` didn't reach the server. */
  deleteAccount?: 'busy' | 'failed';
  /**
   * What All holds. Defaults to no Feeds yet. `read` is every Article already Read. `busy`: `some`, with
   * The Verge posting more than five times in 30 days (FEE-93).
   */
  feeds?: 'none' | 'loading' | 'some' | 'read' | 'busy';
  /** Eight followed Feeds, one with a long name, instead of the usual three (FEE-44). */
  chips?: 'many';
  /**
   * Where adding a Feed is up to. Defaults to idle, where adding succeeds. `choose`: a site with
   * several feeds. `already`: adding finds The Verge, already followed. Any other is that error.
   */
  addFeed?: 'idle' | 'busy' | 'choose' | 'already' | AddFeedReason;
  /**
   * A fetch brings new Articles while the screen is open (FEE-102): `later` adds them when the world's
   * `arrive` is called (tests call it; the state gallery calls it a moment after the world opens).
   */
  arrivals?: 'later';
  /** The list starts scrolled down, past the header (FEE-102): the gallery opens it there; tests scroll. */
  scrolled?: boolean;
  /**
   * A pull's results reach the screen after the pull answers (`late`: `arrive` brings them later) or before it
   * (`early`) (FEE-103). Its Articles are `arrivals`'; without `pull`, a pull fetches nothing new.
   */
  pull?: 'late' | 'early';
  /** Whether a pull-down refresh is under way. */
  refreshing?: boolean;
  /**
   * The chosen Feed (The Verge when none is) stops updating (FEE-126): failing for a `day` (its chip badged), or
   * `recent`ly (not yet). Its site is The Verge's, or `none` (FEE-127).
   */
  failing?: 'day' | 'recent';
  failingSite?: 'none';
  /**
   * Try again on the failing Feed's page (FEE-128): `busy` is under way and never ends; `works` brings the Feed back;
   * by default it fails again, now unreachable.
   */
  tryAgain?: 'busy' | 'works';
  /**
   * New address on the failing Feed's page (FEE-129), as `addFeed` for adding: idle works, and the Feed works again;
   * `already`: Calm Notes uses that address.
   */
  newAddress?: 'idle' | 'busy' | 'choose' | 'already' | AddFeedReason;
  /** The place the phone held when the app started (FEE-130): as stored, or any text, to test what's untrusted. */
  place?: Place | string;
  /** The connection to the server (FEE-32): offline from the start; tests change it with the world's `setNetwork`. */
  network?: 'offline';
  /** The chosen Feed's chip, by id: All shows only its Articles (P5). */
  feed?: string;
  /** The chip whose menu starts open, by its Feed's id (the state gallery; tests long-press it, FEE-97). */
  chipMenu?: string;
  /** Removing a Feed doesn't reach the server. */
  removes?: 'fail';
  /** The Article the Reading view opens. Defaults to one with every kind of block. */
  article?:
    | 'full'
    | 'no-lead-image'
    | 'long-feed-name'
    | 'several-authors'
    | 'no-author'
    | 'omitted'
    | 'extracting'
    | 'unextracted'
    | 'unextracted-no-image'
    | 'missing'
    | 'loading'
    /** Still loading, with the title the list had (FEE-48). */
    | 'loading-with-title';
};

/** What a world's fake Feeds were asked to do. */
export type FeedsLog = {
  added: string[];
  refreshes: number;
  read: string[];
  removed: string[];
  /** Articles whose loading began as a row was touched (FEE-114). */
  prefetched: string[];
  /** Feeds Try again fetched (FEE-128). */
  triedAgain: string[];
  /** New addresses sent, by Feed (FEE-129). */
  moved: { id: string; url: string }[];
};

const emptyLog = (): FeedsLog => ({
  added: [],
  refreshes: 0,
  read: [],
  removed: [],
  prefetched: [],
  triedAgain: [],
  moved: [],
});

/** What a world's fake auth was asked to do. */
export type SignInLog = { starts: number; completions: { code?: string; error?: string }[]; signOuts: number; deletes: number };

const emptySignInLog = (): SignInLog => ({ starts: 0, completions: [], signOuts: 0, deletes: 0 });

/** The Article each Reading world shows. */
const READING_FIXTURES = {
  full: FIXTURE_ARTICLE,
  'no-lead-image': FIXTURE_NO_LEAD_IMAGE_ARTICLE,
  'long-feed-name': FIXTURE_LONG_FEED_ARTICLE,
  'several-authors': FIXTURE_SEVERAL_AUTHORS_ARTICLE,
  'no-author': FIXTURE_NO_AUTHOR_ARTICLE,
  omitted: FIXTURE_OMITTED_ARTICLE,
  extracting: FIXTURE_EXTRACTING_ARTICLE,
  unextracted: FIXTURE_UNEXTRACTED_ARTICLE,
  'unextracted-no-image': { ...FIXTURE_UNEXTRACTED_ARTICLE, imageUrl: undefined },
} as const;

/** A world's Feeds, and `arrive`, which brings its new Articles as a fetch would (FEE-102). */
export type WorldFeeds = FeedsData & {
  arrive: () => void;
  /** The failing Feed works again (FEE-126), as a working fetch would record. */
  recover: () => void;
  /** Drops or restores the connection, as switching networks or airplane mode would (FEE-32). */
  setNetwork: (connection: Connection) => void;
};

const HOUR = 3_600_000;

/** Where adding a Feed, or giving one a new address, starts in a world. */
function addressView(state: NonNullable<WorldSpec['addFeed']>): AddFeedView {
  if (state === 'idle' || state === 'already') return { status: 'idle' };
  if (state === 'busy') return { status: 'busy' };
  if (state === 'choose') return { status: 'choose', choices: FIXTURE_CHOICES };
  return { status: 'error', reason: state };
}

/**
 * A world's address form (adding, or a new address): as the app's, text that isn't an address is never sent (FEE-96);
 * an error stays on the screen until the next try.
 */
function useAddress(start: AddFeedView, send: (url: string) => Promise<AddOutcome>) {
  const [view, setView] = useState(start);
  const add = (url: string): Promise<AddOutcome> => {
    if (!isAddress(url)) {
      setView({ status: 'error', reason: 'invalid-url' });
      return Promise.resolve({ kind: 'stay' });
    }
    return send(url);
  };
  return { view, add };
}

/** A world's Feeds and Articles: fixture data, and a log of what it's asked. */
export function worldFeeds(
  spec: WorldSpec,
  log: FeedsLog = emptyLog(),
): WorldFeeds {
  const feeds = spec.feeds ?? 'none';
  /** The chips a world with Feeds shows: a few, or enough to run off the screen (FEE-44). */
  const someChips = spec.chips === 'many' ? FIXTURE_MANY_CHIPS : FIXTURE_CHIPS;
  const addFeed = spec.addFeed ?? 'idle';
  const article = spec.article ?? 'full';
  const addView = addressView(addFeed);
  const newAddress = spec.newAddress ?? 'idle';
  // A Feed added in this world joins the chips, and one removed leaves them, as Convex's live query would (FEE-45).
  let addedChips: FeedChip[] = [];
  let removedIds = new Set<string>();
  const chipListeners = new Set<() => void>();
  const subscribeChips = (listener: () => void) => {
    chipListeners.add(listener);
    return () => void chipListeners.delete(listener);
  };
  const addChip = (chip: FeedChip) => {
    addedChips = [...addedChips, chip];
    chipListeners.forEach((listener) => listener());
  };
  // A world's failing Feed is the chosen one (The Verge by default), failing since a day and an hour ago, or an hour ago (FEE-126).
  let failingSince: number | null = spec.failing === 'day' ? FIXTURE_NOW - 25 * HOUR : spec.failing === 'recent' ? FIXTURE_NOW - HOUR : null;
  let failingReason: FetchFailure = 'not-a-feed';
  const recover = () => {
    failingSince = null;
    chipListeners.forEach((listener) => listener());
  };
  /** Try again failing again: still failing since the same time, for a new reason (FEE-128). */
  const failAgain = () => {
    failingReason = 'unreachable';
    chipListeners.forEach((listener) => listener());
  };
  const failingId = spec.feed ?? 'f1';
  const failingSite = spec.failingSite === 'none' ? {} : { siteUrl: 'https://www.theverge.com' };
  const withHealth = (chip: FeedChip): FeedChip =>
    chip.id === failingId && failingSince !== null ? { ...chip, failing: { since: failingSince, reason: failingReason, ...failingSite } } : chip;
  const dropChip = (id: string) => {
    removedIds = new Set([...removedIds, id]);
    chipListeners.forEach((listener) => listener());
  };
  // Each view is built once per state, as a query's result stays the same object until it changes.
  const views = new WeakMap<object, Map<string, unknown>>();
  const viewOf = <T,>(state: object, key: string, build: () => T): T => {
    const forState = views.get(state) ?? new Map<string, unknown>();
    views.set(state, forState);
    if (!forState.has(key)) forState.set(key, build());
    return forState.get(key) as T;
  };
  /**
   * A world's Articles change only when its new ones arrive (FEE-102): each state builds its views once, and
   * arriving moves to a new state, as Convex's live query hands the app a new result.
   */
  let articlesState: object = {};
  let arrived = false;
  const articleListeners = new Set<() => void>();
  const subscribeArticles = (listener: () => void) => {
    articleListeners.add(listener);
    return () => void articleListeners.delete(listener);
  };
  let connection: Connection = spec.network ?? 'online';
  const connectionListeners = new Set<() => void>();
  const subscribeConnection = (listener: () => void) => {
    connectionListeners.add(listener);
    return () => void connectionListeners.delete(listener);
  };
  const setNetwork = (next: Connection) => {
    connection = next;
    connectionListeners.forEach((listener) => listener());
  };
  /** When the world's Feeds were last fetched: a while ago, or just now once new Articles arrived (FEE-103). */
  const lastUpdatedAt = () => (feeds === 'none' ? null : arrived ? FIXTURE_NOW : FIXTURE_NOW - FIXTURE_LAST_UPDATED_AGO);
  const arrive = () => {
    if (spec.arrivals !== 'later' || arrived) return;
    arrived = true;
    articlesState = {};
    articleListeners.forEach((listener) => listener());
  };
  const articleView: ArticleView =
    article === 'loading'
      ? { status: 'loading' }
      : article === 'loading-with-title'
        ? { status: 'loading', title: READING_FIXTURES.full.title }
        : article === 'missing'
          ? { status: 'missing' }
          : { status: 'ready', article: READING_FIXTURES[article ?? 'full'] };

  return {
    arrive,
    recover,
    setNetwork,
    useConnection: () => useSyncExternalStore(subscribeConnection, () => connection),
    useAll: (feedId) => {
      const state = useSyncExternalStore(subscribeArticles, () => articlesState);
      if (feeds === 'loading') return { status: 'loading' };
      return viewOf(state, `all:${feedId}`, () => {
        // All is the last 30 days; a Feed's page adds its kept older posts (FEE-93), as the backend does.
        const fetched =
          feeds === 'some' ? FIXTURE_ROWS : feeds === 'busy' ? [...FIXTURE_ROWS, ...FIXTURE_BUSY_ROWS] : feeds === 'read' ? FIXTURE_READ_ROWS : [];
        const recent = arrived ? [...FIXTURE_ARRIVED_ROWS, ...fetched] : fetched;
        const kept = feeds === 'some' || feeds === 'busy' ? FIXTURE_KEPT_ROWS : [];
        const newestFirst = (list: ArticleRow[]) => [...list].sort((x, y) => y.publishedAt - x.publishedAt);
        const shown =
          feedId === null ? newestFirst(recent) : newestFirst([...recent, ...kept].filter((row) => row.feedId === feedId));
        return { status: 'ready' as const, articles: shown };
      });
    },
    useChips: () => {
      const added = useSyncExternalStore(subscribeChips, () => addedChips);
      const removed = useSyncExternalStore(subscribeChips, () => removedIds);
      useSyncExternalStore(subscribeChips, () => failingSince);
      useSyncExternalStore(subscribeChips, () => failingReason);
      if (feeds === 'loading') return { status: 'loading' };
      const chips = [...(feeds === 'none' ? [] : someChips), ...added];
      return { status: 'ready', chips: chips.filter((chip) => !removed.has(chip.id)).map(withHealth) };
    },
    useRemoveFeed: () => async (id) => {
      if (spec.removes === 'fail') return 'failed';
      log.removed.push(id);
      dropChip(id);
      return 'ok';
    },
    useTryAgain: (feedId) => {
      const [trying, setTrying] = useState(spec.tryAgain === 'busy');
      const tryAgain = () => {
        if (trying) return;
        log.triedAgain.push(feedId);
        setTrying(true);
        // As the server records it: the live chips change, then the call answers.
        if (spec.tryAgain === 'busy') return;
        if (spec.tryAgain === 'works') recover();
        else failAgain();
        setTrying(false);
      };
      return { trying, tryAgain };
    },
    usePrefetchArticle: () => (id) => {
      log.prefetched.push(id);
    },
    useArticle: (id) => {
      // Every Reading world shows one Article, whatever the id.
      void id;
      return articleView;
    },
    useAddFeed: () =>
      useAddress(addView, (url) => {
        log.added.push(url);
        // Busy stays busy; an error stays on the screen; idle adds the Feed.
        if (addFeed === 'busy') return new Promise(() => {});
        if (addFeed === 'idle') {
          addChip(FIXTURE_ADDED_CHIP);
          return Promise.resolve({ kind: 'added', feedId: FIXTURE_ADDED_CHIP.id });
        }
        if (addFeed === 'already') return Promise.resolve({ kind: 'already', title: 'The Verge', feedId: 'f1' });
        return Promise.resolve({ kind: 'stay' });
      }),
    useNewAddress: (feedId) =>
      useAddress(addressView(newAddress), (url) => {
        log.moved.push({ id: feedId, url });
        if (newAddress === 'busy') return new Promise(() => {});
        // Idle finds a working feed: the Feed keeps its name and Articles and works again, as the server records it.
        if (newAddress === 'idle') {
          recover();
          return Promise.resolve({ kind: 'added', feedId });
        }
        if (newAddress === 'already') return Promise.resolve({ kind: 'already', title: 'Calm Notes', feedId: 'f2' });
        return Promise.resolve({ kind: 'stay' });
      }),
    useMarkRead: () => (id) => {
      log.read.push(id);
    },
    useLastUpdated: () => {
      useSyncExternalStore(subscribeArticles, () => articlesState);
      if (feeds === 'loading') return { status: 'loading' };
      return { status: 'ready', at: lastUpdatedAt() };
    },
    useRefresh: () => {
      // Re-reads the time whenever the world's Articles change, as the live query would.
      useSyncExternalStore(subscribeArticles, () => articlesState);
      const at = lastUpdatedAt();
      const pull = usePull(async () => {
        log.refreshes += 1;
        if (!spec.pull) return null;
        // `early`: the results are in before the pull answers; `late`: the test brings them with `arrive`.
        if (spec.pull === 'early') arrive();
        return FIXTURE_NOW;
      }, at);
      return spec.refreshing ? { ...pull, refreshing: true } : pull;
    },
  };
}

export type World = {
  /** What `<AppRoot environment>` takes. */
  environment: Environment;
  /** What `<AppRoot auth>` takes: a fixed auth that records what it's asked. */
  auth: Auth;
  signInLog: SignInLog;
  /** What `<AppRoot feeds>` takes: fixture Feeds and Articles that record what they're asked. */
  feeds: WorldFeeds;
  feedsLog: FeedsLog;
  /** What `<AppRoot place>` takes: the phone's store, holding the spec's place, counting its writes (FEE-130). */
  place: ReturnType<typeof memoryPlaceStore>;
  /** Where the router starts. */
  initialUrl: '/' | '/sign-in' | `/article/${string}` | `/?feed=${string}`;
  /** Puts back what the world changed: the theme follows the phone again. */
  dispose: () => void;
};

/** The environment a world gives the app, without applying anything. */
export function worldEnvironment(spec: WorldSpec): Environment {
  return {
    colorScheme: spec.colorScheme,
    reduceMotion: spec.reduceMotion ?? false,
    fontScale: spec.fontScale ?? 1,
    now: () => FIXTURE_NOW,
  };
}

const SIGN_IN_VIEWS: Record<NonNullable<WorldSpec['auth']>, SignInView> = {
  'signed-in': { status: 'idle' },
  'signed-out': { status: 'idle' },
  'signing-in': { status: 'busy' },
  'not-allowed': { status: 'error', kind: 'not-allowed' },
  failed: { status: 'error', kind: 'failed' },
};

/** A world's auth, without applying anything: fixed state, and a log of what it's asked. */
export function worldAuth(spec: WorldSpec, log: SignInLog = emptySignInLog()): Auth {
  const state = spec.auth ?? 'signed-in';
  const signedIn = state === 'signed-in';
  const account: Account = spec.account === 'no-name' ? { email: FIXTURE_ACCOUNT.email, initial: accountInitial({ email: FIXTURE_ACCOUNT.email }) } : FIXTURE_ACCOUNT;
  return {
    session: signedIn ? 'signed-in' : 'signed-out',
    account: signedIn ? account : null,
    signIn: SIGN_IN_VIEWS[state],
    signOut: async () => {
      log.signOuts += 1;
      // With no server, the real adapter still clears the phone's tokens: the fake resolves as it does.
    },
    signingOut: spec.signOut === 'busy',
    deleteAccount: async () => {
      log.deletes += 1;
    },
    deletion: spec.deleteAccount === 'busy' ? 'deleting' : spec.deleteAccount === 'failed' ? 'failed' : 'idle',
    startSignIn: () => {
      log.starts += 1;
    },
    completeSignIn: (link) => {
      log.completions.push(link);
    },
  };
}

const SECTION_URLS = {
  feeds: '/',
  // Adding a Feed is a sheet over Feeds (FEE-45): tests tap +, the gallery opens it at once.
  'add-feed': '/',
  article: `/article/${FIXTURE_ROWS[0].id}`,
} as const satisfies Record<NonNullable<WorldSpec['section']>, World['initialUrl']>;

export function createWorld(spec: WorldSpec): World {
  Uniwind.setTheme(spec.colorScheme);
  const signInLog = emptySignInLog();
  const signedIn = (spec.auth ?? 'signed-in') === 'signed-in';
  const feedsLog: FeedsLog = emptyLog();

  return {
    environment: worldEnvironment(spec),
    auth: worldAuth(spec, signInLog),
    signInLog,
    feeds: worldFeeds(spec, feedsLog),
    feedsLog,
    place: memoryPlaceStore(spec.place === undefined ? null : typeof spec.place === 'string' ? spec.place : JSON.stringify(spec.place)),
    initialUrl: !signedIn
      ? '/sign-in'
      : spec.feed && (spec.section ?? 'feeds') === 'feeds'
        ? `/?feed=${encodeURIComponent(spec.feed)}`
        : SECTION_URLS[spec.section ?? 'feeds'],
    dispose: () => Uniwind.setTheme('system'),
  };
}

export type CatalogWorld = { id: string; label: string; spec: WorldSpec };
