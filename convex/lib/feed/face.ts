import type { Doc } from '../../_generated/dataModel';

/** A Feed's icon: the one its site names, else `/favicon.ico` on its site; never from its secret URL (Q9). */
export function faviconOf(feed: Pick<Doc<'feeds'>, 'iconUrl' | 'siteUrl'>): string | undefined {
  if (feed.iconUrl) return feed.iconUrl;
  return feed.siteUrl ? `${feed.siteUrl}/favicon.ico` : undefined;
}
