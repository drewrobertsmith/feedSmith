import type { Doc } from '../../_generated/dataModel';
import { internal } from '../../_generated/api';
import type { MutationCtx } from '../../_generated/server';

/**
 * The fetch scheduler's one booked run (`refresh.scheduleDue`), kept in the `fetchTimer` row so
 * it's moved or cancelled, never doubled (FEE-55, T28).
 *
 * A scheduled mutation's own job reads as pending while it runs (Convex never shows a mutation as
 * in progress), so a booked run whose time has come is either the run that's calling, or one about
 * to start. Neither is ever cancelled.
 */
async function booking(ctx: MutationCtx) {
  const timer = await ctx.db.query('fetchTimer').first();
  const job = timer ? await ctx.db.system.get(timer.scheduledId) : null;
  return { timer, job: job?.state.kind === 'pending' ? job : null };
}

async function book(ctx: MutationCtx, timer: Doc<'fetchTimer'> | null, at: number) {
  const scheduledId = await ctx.scheduler.runAt(at, internal.refresh.scheduleDue, {});
  if (timer) await ctx.db.patch(timer._id, { scheduledId });
  else await ctx.db.insert('fetchTimer', { scheduledId });
}

/**
 * After a run: books the next one for when the soonest Feed falls due, or none when there are no
 * Feeds. A booked run still in the future is replaced; the run that's calling is left alone.
 */
export async function bookNextFetch(ctx: MutationCtx) {
  const { timer, job } = await booking(ctx);
  const soonest = await ctx.db.query('feedSchedules').withIndex('by_next_fetch').first();
  const now = Date.now();
  const future = job && job.scheduledTime > now ? job : null;
  if (!soonest) {
    if (future) await ctx.scheduler.cancel(future._id);
    if (timer) await ctx.db.delete(timer._id);
    return;
  }
  const at = Math.max(now, soonest.nextFetchAt);
  if (future?.scheduledTime === at) return;
  if (future) await ctx.scheduler.cancel(future._id);
  await book(ctx, timer, at);
}

/**
 * After a Feed's schedule is written: brings the booked run forward if this Feed is now due
 * sooner, and books one if none is waiting (a lost chain, or the first Feed). A Feed due later
 * changes nothing, and only the timer row is read then, so fetch results don't contend.
 */
export async function bringFetchForward(ctx: MutationCtx, nextFetchAt: number) {
  const { timer, job } = await booking(ctx);
  if (job && job.scheduledTime <= nextFetchAt) return;
  const now = Date.now();
  // Nothing waiting: the soonest of all Feeds decides, not just this one.
  const soonest = job ? null : await ctx.db.query('feedSchedules').withIndex('by_next_fetch').first();
  const at = Math.max(now, Math.min(nextFetchAt, soonest?.nextFetchAt ?? Infinity));
  if (job) await ctx.scheduler.cancel(job._id);
  await book(ctx, timer, at);
}

/** The hourly safety check: books the run again if none is waiting and any Feed exists. */
export async function ensureFetchBooked(ctx: MutationCtx) {
  const { job } = await booking(ctx);
  if (job) return;
  const soonest = await ctx.db.query('feedSchedules').withIndex('by_next_fetch').first();
  if (soonest) await bringFetchForward(ctx, soonest.nextFetchAt);
}
