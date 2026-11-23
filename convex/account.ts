import { ConvexError, v } from 'convex/values';

import { components, internal } from './_generated/api';
import { internalMutation, mutation } from './_generated/server';
import { AUTH_ERRORS } from './lib/authErrors';
import { requireUserId } from './lib/currentUser';
import { DELETE_BATCH } from './lib/feed/blocks';

/**
 * Deletes the signed-in User's Account for good (P18): the User, their Feeds, every session and
 * their Google sign-in link at once, in this one transaction, then their Articles a batch at a
 * time. It takes no arguments, so it can only ever delete the caller's own Account (Q10).
 *
 * Convex Auth keeps sessions and the Google link in its own components, so they're deleted
 * through those components' functions (T25). The core's `createdUserIds` row has none yet and
 * stays; it holds only the old id (convex/convex-auth#935).
 */
export const deleteAccount = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const user = await ctx.db.get(userId);
    if (user === null) throw new ConvexError(AUTH_ERRORS.accountGone);

    // Feeds first, in this transaction: a fetch or page read that finishes later finds its
    // Feed gone and writes nothing, so no Article can arrive for a deleted User.
    const feeds = await ctx.db
      .query('feeds')
      .withIndex('by_user_url', (q) => q.eq('userId', userId))
      .collect();
    await Promise.all(feeds.map((feed) => ctx.db.delete(feed._id)));

    await ctx.runMutation(components.authGoogle.provider.deleteUser, { userId });
    const sessions = await ctx.runQuery(components.auth.public.listSessions, { userId });
    await ctx.runMutation(components.auth.public.revokeSessions, {
      sessionIds: sessions.map((session) => session.sessionId),
    });

    await ctx.db.delete(userId);
    await ctx.scheduler.runAfter(0, internal.account.deleteArticles, { userId });
    return null;
  },
});

/** Deletes a deleted User's Articles and their bodies, a batch at a time, until none are left. */
export const deleteArticles = internalMutation({
  args: { userId: v.id('users') },
  returns: v.null(),
  handler: async (ctx, { userId }) => {
    const articles = await ctx.db
      .query('articles')
      .withIndex('by_user_published', (q) => q.eq('userId', userId))
      .take(DELETE_BATCH);
    await Promise.all(
      articles.map(async (article) => {
        const bodies = await ctx.db
          .query('articleBodies')
          .withIndex('by_article', (q) => q.eq('articleId', article._id))
          .take(10);
        await Promise.all(bodies.map((body) => ctx.db.delete(body._id)));
        await ctx.db.delete(article._id);
      }),
    );
    if (articles.length === DELETE_BATCH) await ctx.scheduler.runAfter(0, internal.account.deleteArticles, { userId });
    return null;
  },
});
