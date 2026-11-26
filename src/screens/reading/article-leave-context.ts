import { createContext, use } from 'react';

/** Closes the page through its transition, on the axis, then runs `leave` (FEE-115). */
export const ArticleLeaveContext = createContext<((leave: () => void) => void) | undefined>(undefined);

/**
 * How the Reading view leaves for somewhere other than Back (the Feed link, "Back to All"): the page closes
 * the way Back closes it, then `leave` navigates (FEE-115). Without a transition (Remove animations, or a link
 * the route refused), it navigates at once.
 */
export function useLeaveArticle(): (leave: () => void) => void {
  const close = use(ArticleLeaveContext);
  return close ?? ((leave) => leave());
}
