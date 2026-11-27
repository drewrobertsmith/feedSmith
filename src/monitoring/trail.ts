import { addBreadcrumb } from '@sentry/react-native';

/** The User's actions a crash report can show (T50). */
export type TrailAction =
  | 'auth.signed-in'
  | 'auth.signed-out'
  | 'account.deletion-started'
  | 'account.deleted'
  | 'article.prefetched'
  | 'article.opened'
  | 'article.read'
  | 'feed.added'
  | 'feed.new-address'
  | 'feed.removed'
  | 'feed.try-again'
  | 'feeds.refreshed';

export type TrailOutcome = 'ok' | 'failed' | 'added' | 'already' | 'choose';

export type TrailDetails = { articleId?: string; feedId?: string; outcome?: TrailOutcome; count?: number };

const KEPT = new Set<string>(['articleId', 'feedId', 'outcome', 'count']);

/** A Convex id or an outcome: letters, digits, `-` and `_` only. A URL, a host or any text never is (Q9). */
const isIdLike = (value: string) => /^[\w-]+$/.test(value);

/**
 * Leaves a breadcrumb for one of the User's actions, so a crash report shows what came just before it. Only ids, an
 * outcome and counts go; any other key, and any string that isn't id-shaped, is dropped here (Q12).
 */
export function trail(action: TrailAction, details: TrailDetails = {}) {
  const data: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(details)) {
    if (!KEPT.has(key)) continue;
    if (typeof value === 'number' ? Number.isFinite(value) : typeof value === 'string' && isIdLike(value)) {
      data[key] = value;
    }
  }
  addBreadcrumb({ category: 'feedsmith', message: action, level: 'info', data });
}
