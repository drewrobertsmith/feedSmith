import { useSyncExternalStore } from 'react';
import { Uniwind } from 'uniwind';

import type { Account, Auth } from '@/auth/auth-context';
import type { SignInView } from '@/auth/sign-in-outcome';
import type { Environment } from '@/environment';
import type { AddFeedReason, AddFeedView, ArticleRow, ArticleView, FeedsData, SavedBefore } from '@/feeds/feeds-data';
import {
  FIXTURE_ACCOUNT,
  FIXTURE_ARTICLE,
  FIXTURE_CHIPS,
  FIXTURE_CHOICES,
  FIXTURE_LAST_UPDATED_AGO,
  FIXTURE_EXTRACTING_ARTICLE,
  FIXTURE_LONG_FEED_ARTICLE,
  FIXTURE_MANAGE,
  FIXTURE_MANAGE_PINNED,
  FIXTURE_MANY_CHIPS,
  FIXTURE_NO_AUTHOR_ARTICLE,
  FIXTURE_NO_LEAD_IMAGE_ARTICLE,
  FIXTURE_NOW,
  FIXTURE_OMITTED_ARTICLE,
  FIXTURE_READ_ROWS,
  FIXTURE_NO_PINS,
  FIXTURE_QUIET_PINS,
  FIXTURE_ROWS,
  FIXTURE_SAVED_ROWS,
  FIXTURE_THREE_PINS,
  FIXTURE_TWO_PINS,
  FIXTURE_SEVERAL_AUTHORS_ARTICLE,
  FIXTURE_UNEXTRACTED_ARTICLE,
} from '@/worlds/fixtures';
import type { ThemeName } from '@/theme/tokens';
import { accountInitial } from '../../convex/lib/account';
import { PINNED } from '../../convex/lib/pinned';

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
  section?: 'feeds' | 'saved' | 'add-feed' | 'article' | 'manage';
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
  /** What All holds. Defaults to no Feeds yet. `read` is every Article already Read. */
  feeds?: 'none' | 'loading' | 'some' | 'read';
  /** Eight followed Feeds, one with a long name, instead of the usual three (FEE-44). */
  chips?: 'many';
  /**
   * Where adding a Feed is up to. Defaults to idle, where adding succeeds. `choose`: a site with
   * several feeds. `already`: adding finds The Verge, already followed.
   */
  addFeed?: 'idle' | 'busy' | 'choose' | 'already' | AddFeedReason;
  /** Whether a pull-down refresh is under way. */
  refreshing?: boolean;
  /**
   * What Saved holds. With Feeds, defaults to `some`: two Articles from All and one whose Feed was
   * removed (T23); without, to `none`.
   */
  saved?: 'some' | 'none' | 'loading';
  /** Save, Done and Undo don't reach the server. */
  savedWrites?: 'fail';
  /** The chosen Feed's chip, by id: All shows only its Articles (P5). */
  feed?: string;
  /**
   * `full`: three Feeds are Pinned already, so another Pin is refused (P9). `two`: The Verge and Calm
   * Notes are Pinned, so the Pinned chip shows (FEE-59). `quiet`: two Pinned Feeds with nothing new.
   */
  pins?: 'full' | 'two' | 'three' | 'quiet' | 'none';
  /** What Manage Feeds lists. Defaults to `some`: one Pinned Feed, one not working. */
  manage?: 'some' | 'pinned' | 'none' | 'loading';
  /** Manage Feeds' writes don't reach the server, or the server refuses the name. */
  manageWrites?: 'fail' | 'invalid';
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
    | 'loading-with-title'
    | 'removed-feed';
  /** The Article the Reading view opens is Saved (FEE-30). */
  articleSaved?: true;
};

/** What a world's fake Feeds were asked to do. */
export type FeedsLog = {
  added: string[];
  refreshes: number;
  read: string[];
  pins: { id: string; pinned: boolean }[];
  renames: { id: string; title: string }[];
  removed: string[];
  pinOrders: string[][];
  saves: string[];
  dones: string[];
  restores: { id: string; before: SavedBefore }[];
  restoredPins: { id: string; place?: number }[];
};

const emptyLog = (): FeedsLog => ({
  added: [],
  refreshes: 0,
  read: [],
  pins: [],
  renames: [],
  removed: [],
  pinOrders: [],
  saves: [],
  dones: [],
  restores: [],
  restoredPins: [],
});

/**
 * A world's Saved and Read state, which Save, Done and Undo change as the real ones do, so a
 * screen shows the change at once (Q3). Saved ids are kept most recently Saved first.
 */
function savedStore(saved: string[], read: string[]) {
  let state = { saved, read: new Set(read) };
  const listeners = new Set<() => void>();
  const set = (next: typeof state) => {
    state = next;
    listeners.forEach((listener) => listener());
  };
  return {
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    get: () => state,
    /** The Article's state as Undo would need it: a Saved time that keeps its place, and Read. */
    before: (id: string): SavedBefore => ({
      ...(state.saved.includes(id) ? { savedAt: state.saved.length - state.saved.indexOf(id) } : {}),
      ...(state.read.has(id) ? { readAt: 1 } : {}),
    }),
    save: (id: string) => {
      if (!state.saved.includes(id)) set({ ...state, saved: [id, ...state.saved] });
    },
    done: (id: string) => set({ saved: state.saved.filter((s) => s !== id), read: new Set([...state.read, id]) }),
    /** Puts an Article back where `before` found it: its place in Saved, and Read or not. */
    restore: (id: string, before: SavedBefore) => {
      const rest = state.saved.filter((s) => s !== id);
      const saved =
        before.savedAt === undefined ? rest : rest.toSpliced(Math.max(0, rest.length + 1 - before.savedAt), 0, id);
      const read = new Set(state.read);
      if (before.readAt === undefined) read.delete(id);
      else read.add(id);
      set({ saved, read });
    },
  };
}

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
  // Saved, then its Feed removed: it keeps the Feed's name, with no Feed to link to (T23).
  'removed-feed': { ...FIXTURE_ARTICLE, feedId: undefined, feedTitle: 'Morning Brief' },
} as const;

/** A world's Feeds and Articles: fixture data, and a log of what it's asked. */
export function worldFeeds(
  spec: WorldSpec,
  log: FeedsLog = emptyLog(),
): FeedsData {
  const manage = spec.manage ?? 'some';
  const feeds = spec.feeds ?? 'none';
  /** The chips a world with Feeds shows: a few, or enough to run off the screen (FEE-44). */
  const someChips =
    spec.chips === 'many'
      ? FIXTURE_MANY_CHIPS
      : spec.pins === 'two'
        ? FIXTURE_TWO_PINS
        : spec.pins === 'three'
          ? FIXTURE_THREE_PINS
          : spec.pins === 'quiet'
            ? FIXTURE_QUIET_PINS
            : spec.pins === 'none'
              ? FIXTURE_NO_PINS
              : FIXTURE_CHIPS;
  /** The Feeds the Pinned view reads (FEE-59). */
  const pinnedIds = new Set(someChips.filter((chip) => chip.pinned).map((chip) => chip.id));
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
  const universe = [...FIXTURE_ROWS, ...FIXTURE_SAVED_ROWS.filter((row) => !FIXTURE_ROWS.some((r) => r.id === row.id))];
  // Saved has Articles when the world has Feeds, unless it says otherwise.
  const savedSpec = spec.saved ?? (feeds === 'some' || feeds === 'read' ? 'some' : 'none');
  const store = savedStore(
    [...(spec.articleSaved ? [FIXTURE_ROWS[0].id] : []), ...(savedSpec === 'some' ? FIXTURE_SAVED_ROWS.map((row) => row.id) : [])],
    universe.filter((row) => feeds === 'read' || row.read).map((row) => row.id),
  );
  const useStore = () => useSyncExternalStore(store.subscribe, store.get);
  // Each view is built once per state, as a query's result stays the same object until it changes.
  const views = new WeakMap<object, Map<string, unknown>>();
  const viewOf = <T,>(state: object, key: string, build: () => T): T => {
    const forState = views.get(state) ?? new Map<string, unknown>();
    views.set(state, forState);
    if (!forState.has(key)) forState.set(key, build());
    return forState.get(key) as T;
  };
  const live = (row: ArticleRow, state: ReturnType<typeof store.get>): ArticleRow => ({
    ...row,
    saved: state.saved.includes(row.id),
    read: state.read.has(row.id),
  });
  const writes = async (record: () => void, change: () => void) => {
    if (spec.savedWrites === 'fail') return null;
    record();
    change();
    return null;
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
    useAll: (feedId) => {
      const state = useStore();
      if (feeds === 'loading') return { status: 'loading' };
      return viewOf(state, `all:${feedId}`, () => {
        const rows = (feeds === 'some' ? FIXTURE_ROWS : feeds === 'read' ? FIXTURE_READ_ROWS : []).map((row) => live(row, state));
        const shown =
          feedId === null
            ? rows
            : feedId === PINNED
              ? rows.filter((row) => row.feedId !== undefined && pinnedIds.has(row.feedId))
              : rows.filter((row) => row.feedId === feedId);
        return { status: 'ready' as const, articles: shown };
      });
    },
    useSaved: () => {
      const state = useStore();
      if (savedSpec === 'loading') return { status: 'loading' };
      return viewOf(state, 'saved', () => {
        const byId = new Map(universe.map((row) => [row.id, row]));
        return { status: 'ready' as const, articles: state.saved.flatMap((id) => (byId.has(id) ? [live(byId.get(id)!, state)] : [])) };
      });
    },
    useSavedActions: () => ({
      save: async (id) => {
        const before = store.before(id);
        await writes(() => log.saves.push(id), () => store.save(id));
        return spec.savedWrites === 'fail' ? null : before;
      },
      done: async (id) => {
        const before = store.before(id);
        await writes(() => log.dones.push(id), () => store.done(id));
        return spec.savedWrites === 'fail' ? null : before;
      },
      restore: async (id, before) => {
        await writes(() => log.restores.push({ id, before }), () => store.restore(id, before));
      },
    }),
    useChips: () => (feeds === 'loading' ? { status: 'loading' } : { status: 'ready', chips: feeds === 'none' ? [] : someChips }),
    useManage: () =>
      manage === 'loading'
        ? { status: 'loading' }
        : { status: 'ready', feeds: manage === 'none' ? [] : manage === 'pinned' ? FIXTURE_MANAGE_PINNED : FIXTURE_MANAGE },
    useManageActions: () => ({
      rename: async (id, title) => {
        if (spec.manageWrites === 'fail') return 'failed';
        if (spec.manageWrites === 'invalid') return 'invalid-name';
        log.renames.push({ id, title });
        return 'ok';
      },
      remove: async (id) => {
        if (spec.manageWrites === 'fail') return 'failed';
        log.removed.push(id);
        return 'ok';
      },
      orderPins: async (ids) => {
        log.pinOrders.push(ids);
      },
    }),
    useSetPinned: () => async (id, pinned) => {
      if (pinned && spec.pins === 'full') return { outcome: 'pins-full' };
      log.pins.push({ id, pinned });
      // An Unpin says where the Feed was among the Pins, for Undo.
      const place = someChips.filter((chip) => chip.pinned).findIndex((chip) => chip.id === id);
      return pinned || place < 0 ? { outcome: 'ok' } : { outcome: 'ok', place };
    },
    useRestorePin: () => async (id, place) => {
      log.restoredPins.push({ id, place });
      return 'ok';
    },
    useArticle: (id) => {
      const state = useStore();
      if (articleView.status !== 'ready') return articleView;
      return viewOf(state, `article:${id}`, () => ({ ...articleView, article: { ...articleView.article, saved: state.saved.includes(id) } }));
    },
    useAddFeed: () => ({
      view: addView,
      add: (url) => {
        log.added.push(url);
        // Busy stays busy; an error stays on the screen; idle adds the Feed.
        if (addFeed === 'busy') return new Promise(() => {});
        if (addFeed === 'idle') return Promise.resolve({ kind: 'added' });
        if (addFeed === 'already') return Promise.resolve({ kind: 'already', title: 'The Verge', feedId: 'f1' });
        return Promise.resolve({ kind: 'stay' });
      },
    }),
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
  initialUrl: '/' | '/saved' | '/sign-in' | '/add-feed' | '/manage-feeds' | `/article/${string}` | `/?feed=${string}`;
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
  saved: '/saved',
  'add-feed': '/add-feed',
  manage: '/manage-feeds',
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
