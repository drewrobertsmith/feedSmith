import { useState, useSyncExternalStore } from 'react';
import { Uniwind } from 'uniwind';

import type { Account, Auth } from '@/auth/auth-context';
import type { SignInView } from '@/auth/sign-in-outcome';
import type { Environment } from '@/environment';
import { isAddress, type AddFeedReason, type AddFeedView, type AddOutcome, type ArticleRow, type ArticleView, type FeedChip, type FeedsData } from '@/feeds/feeds-data';
import {
  FIXTURE_ACCOUNT,
  FIXTURE_ARTICLE,
  FIXTURE_ADDED_CHIP,
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
  /** Whether a pull-down refresh is under way. */
  refreshing?: boolean;
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
};

const emptyLog = (): FeedsLog => ({
  added: [],
  refreshes: 0,
  read: [],
  removed: [],
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

/** A world's Feeds and Articles: fixture data, and a log of what it's asked. */
export function worldFeeds(
  spec: WorldSpec,
  log: FeedsLog = emptyLog(),
): FeedsData {
  const feeds = spec.feeds ?? 'none';
  /** The chips a world with Feeds shows: a few, or enough to run off the screen (FEE-44). */
  const someChips = spec.chips === 'many' ? FIXTURE_MANY_CHIPS : FIXTURE_CHIPS;
  const addFeed = spec.addFeed ?? 'idle';
  const article = spec.article ?? 'full';
  const addView: AddFeedView =
    addFeed === 'idle' || addFeed === 'already'
      ? { status: 'idle' }
      : addFeed === 'busy'
        ? { status: 'busy' }
        : addFeed === 'choose'
          ? { status: 'choose', choices: FIXTURE_CHOICES }
          : { status: 'error', reason: addFeed };
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
  /** A world's Articles don't change while it's shown, so its views are built once. */
  const fixed = {};
  const articleView: ArticleView =
    article === 'loading'
      ? { status: 'loading' }
      : article === 'loading-with-title'
        ? { status: 'loading', title: READING_FIXTURES.full.title }
        : article === 'missing'
          ? { status: 'missing' }
          : { status: 'ready', article: READING_FIXTURES[article ?? 'full'] };

  return {
    useAll: (feedId) => {
      if (feeds === 'loading') return { status: 'loading' };
      return viewOf(fixed, `all:${feedId}`, () => {
        // All is the last 30 days; a Feed's page adds its kept older posts (FEE-93), as the backend does.
        const recent =
          feeds === 'some' ? FIXTURE_ROWS : feeds === 'busy' ? [...FIXTURE_ROWS, ...FIXTURE_BUSY_ROWS] : feeds === 'read' ? FIXTURE_READ_ROWS : [];
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
      if (feeds === 'loading') return { status: 'loading' };
      const chips = [...(feeds === 'none' ? [] : someChips), ...added];
      return { status: 'ready', chips: chips.filter((chip) => !removed.has(chip.id)) };
    },
    useRemoveFeed: () => async (id) => {
      if (spec.removes === 'fail') return 'failed';
      log.removed.push(id);
      dropChip(id);
      return 'ok';
    },
    useArticle: (id) => {
      // Every Reading world shows one Article, whatever the id.
      void id;
      return articleView;
    },
    useAddFeed: () => {
      const [view, setView] = useState(addView);
      const add = (url: string): Promise<AddOutcome> => {
        // As the app does: text that isn't an address is never sent (FEE-96).
        if (!isAddress(url)) {
          setView({ status: 'error', reason: 'invalid-url' });
          return Promise.resolve({ kind: 'stay' });
        }
        log.added.push(url);
        // Busy stays busy; an error stays on the screen; idle adds the Feed.
        if (addFeed === 'busy') return new Promise(() => {});
        if (addFeed === 'idle') {
          addChip(FIXTURE_ADDED_CHIP);
          return Promise.resolve({ kind: 'added', feedId: FIXTURE_ADDED_CHIP.id });
        }
        if (addFeed === 'already') return Promise.resolve({ kind: 'already', title: 'The Verge', feedId: 'f1' });
        return Promise.resolve({ kind: 'stay' });
      };
      return { view, add };
    },
    useMarkRead: () => (id) => {
      log.read.push(id);
    },
    useLastUpdated: () =>
      feeds === 'loading'
        ? { status: 'loading' }
        : { status: 'ready', at: feeds === 'none' ? null : FIXTURE_NOW - FIXTURE_LAST_UPDATED_AGO },
    useRefresh: () => ({
      refreshing: spec.refreshing ?? false,
      refresh: async () => {
        log.refreshes += 1;
      },
    }),
  };
}

export type World = {
  /** What `<AppRoot environment>` takes. */
  environment: Environment;
  /** What `<AppRoot auth>` takes: a fixed auth that records what it's asked. */
  auth: Auth;
  signInLog: SignInLog;
  /** What `<AppRoot feeds>` takes: fixture Feeds and Articles that record what they're asked. */
  feeds: FeedsData;
  feedsLog: FeedsLog;
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
    initialUrl: !signedIn
      ? '/sign-in'
      : spec.feed && (spec.section ?? 'feeds') === 'feeds'
        ? `/?feed=${encodeURIComponent(spec.feed)}`
        : SECTION_URLS[spec.section ?? 'feeds'],
    dispose: () => Uniwind.setTheme('system'),
  };
}

export type CatalogWorld = { id: string; label: string; spec: WorldSpec };
