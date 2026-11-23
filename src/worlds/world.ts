import { Uniwind } from 'uniwind';

import type { Auth } from '@/auth/auth-context';
import type { SignInView } from '@/auth/sign-in-outcome';
import type { Environment } from '@/environment';
import type { AddFeedReason, AddFeedView, ArticleView, FeedsData } from '@/feeds/feeds-data';
import {
  FIXTURE_ARTICLE,
  FIXTURE_CHIPS,
  FIXTURE_CHOICES,
  FIXTURE_EXTRACTING_ARTICLE,
  FIXTURE_LONG_FEED_ARTICLE,
  FIXTURE_MANAGE,
  FIXTURE_MANAGE_PINNED,
  FIXTURE_NO_LEAD_IMAGE_ARTICLE,
  FIXTURE_NOW,
  FIXTURE_OMITTED_ARTICLE,
  FIXTURE_READ_ROWS,
  FIXTURE_ROWS,
  FIXTURE_UNEXTRACTED_ARTICLE,
} from '@/worlds/fixtures';
import type { ThemeName } from '@/theme/tokens';

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
  /** What All holds. Defaults to no Feeds yet. `read` is every Article already Read. */
  feeds?: 'none' | 'loading' | 'some' | 'read';
  /**
   * Where adding a Feed is up to. Defaults to idle, where adding succeeds. `choose`: a site with
   * several feeds. `already`: adding finds The Verge, already followed.
   */
  addFeed?: 'idle' | 'busy' | 'choose' | 'already' | AddFeedReason;
  /** Whether a pull-down refresh is under way. */
  refreshing?: boolean;
  /** The chosen Feed's chip, by id: All shows only its Articles (P5). */
  feed?: string;
  /** `full`: three Feeds are Pinned already, so another Pin is refused (P9). */
  pins?: 'full';
  /** What Manage Feeds lists. Defaults to `some`: one Pinned Feed, one not working. */
  manage?: 'some' | 'pinned' | 'none' | 'loading';
  /** Manage Feeds' writes don't reach the server, or the server refuses the name. */
  manageWrites?: 'fail' | 'invalid';
  /** The Article the Reading view opens. Defaults to one with every kind of block. */
  article?:
    | 'full'
    | 'no-lead-image'
    | 'long-feed-name'
    | 'omitted'
    | 'extracting'
    | 'unextracted'
    | 'unextracted-no-image'
    | 'missing'
    | 'loading';
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
};

const emptyLog = (): FeedsLog => ({ added: [], refreshes: 0, read: [], pins: [], renames: [], removed: [], pinOrders: [] });

/** What a world's fake auth was asked to do. */
export type SignInLog = { starts: number; completions: { code?: string; error?: string }[] };

/** The Article each Reading world shows. */
const READING_FIXTURES = {
  full: FIXTURE_ARTICLE,
  'no-lead-image': FIXTURE_NO_LEAD_IMAGE_ARTICLE,
  'long-feed-name': FIXTURE_LONG_FEED_ARTICLE,
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
  const manage = spec.manage ?? 'some';
  const feeds = spec.feeds ?? 'none';
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
  const articleView: ArticleView =
    article === 'loading'
      ? { status: 'loading' }
      : article === 'missing'
        ? { status: 'missing' }
        : { status: 'ready', article: READING_FIXTURES[article ?? 'full'] };

  return {
    useAll: (feedId) => {
      if (feeds === 'loading') return { status: 'loading' };
      const rows = feeds === 'some' ? FIXTURE_ROWS : feeds === 'read' ? FIXTURE_READ_ROWS : [];
      return { status: 'ready', articles: feedId === null ? rows : rows.filter((row) => row.feedId === feedId) };
    },
    useChips: () =>
      feeds === 'loading' ? { status: 'loading' } : { status: 'ready', chips: feeds === 'none' ? [] : FIXTURE_CHIPS },
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
      if (pinned && spec.pins === 'full') return 'pins-full';
      log.pins.push({ id, pinned });
      return 'ok';
    },
    useArticle: () => articleView,
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
export function worldAuth(spec: WorldSpec, log: SignInLog = { starts: 0, completions: [] }): Auth {
  const state = spec.auth ?? 'signed-in';
  return {
    session: state === 'signed-in' ? 'signed-in' : 'signed-out',
    signIn: SIGN_IN_VIEWS[state],
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
  const signInLog: SignInLog = { starts: 0, completions: [] };
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
        ? `/?feed=${spec.feed}`
        : SECTION_URLS[spec.section ?? 'feeds'],
    dispose: () => Uniwind.setTheme('system'),
  };
}

export type CatalogWorld = { id: string; label: string; spec: WorldSpec };
