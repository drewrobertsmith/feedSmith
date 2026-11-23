import type { Doc } from '../../_generated/dataModel';

/** A Feed's icon: the one its site names, else `/favicon.ico` on its site; never from its secret URL (Q9). */
export function faviconOf(feed: Pick<Doc<'feeds'>, 'iconUrl' | 'siteUrl'>): string | undefined {
  if (feed.iconUrl) return feed.iconUrl;
  return feed.siteUrl ? new URL('/favicon.ico', feed.siteUrl).href : undefined;
}

/** The host a Feed shows (D13): its site's, else its feed's. Only ever a host, never the URL (Q9). */
export function hostOf(feed: Pick<Doc<'feeds'>, 'url' | 'siteUrl'>): string {
  return new URL(feed.siteUrl ?? feed.url).hostname;
}
