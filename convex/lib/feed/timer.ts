import { internal } from '../../_generated/api';
import type { MutationCtx } from '../../_generated/server';

/**
 * Books the fetch scheduler's one run (`refresh.scheduleDue`) for when the soonest Feed falls due
 * (FEE-55), so the server sleeps between due Feeds instead of waking every few minutes.
 *
 * - `exact` (the scheduler itself, after a run): the next run moves to the soonest due time, and
 *   with no Feeds nothing is booked.
 * - `sooner` (whenever a schedule is written, and the hourly safety check): it only brings the
 *   run forward, or books one when none is waiting. A Feed due later leaves it alone, so the
 *   results of many fetches don't all write this one row.
 */
export async function bookFetchTimer(ctx: MutationCtx, mode: 'exact' | 'sooner') {
  const soonest = await ctx.db.query('feedSchedules').withIndex('by_next_fetch').first();
  const timer = await ctx.db.query('fetchTimer').first();
  const booked = timer ? await ctx.db.system.get(timer.scheduledId) : null;
  // The run that is calling this is in progress, not pending: it never counts as booked.
  const pending = booked?.state.kind === 'pending' ? booked : null;

  if (!soonest) {
    if (mode === 'exact') {
      if (pending) await ctx.scheduler.cancel(pending._id);
      if (timer) await ctx.db.delete(timer._id);
    }
    return;
  }
  const at = Math.max(Date.now(), soonest.nextFetchAt);
  if (pending && (pending.scheduledTime === at || (mode === 'sooner' && pending.scheduledTime <= at))) return;
  if (pending) await ctx.scheduler.cancel(pending._id);
  const scheduledId = await ctx.scheduler.runAt(at, internal.refresh.scheduleDue, {});
  if (timer) await ctx.db.patch(timer._id, { scheduledId });
  else await ctx.db.insert('fetchTimer', { scheduledId });
}
