import type { TestConvex } from 'convex-test';
import type { GenericSchema, SchemaDefinition } from 'convex/server';
import { vi } from 'vitest';

const FETCH_SCHEDULER = 'refresh:scheduleDue';

/**
 * Runs every scheduled function that's due by the fake clock's now, and any they schedule for now,
 * then stops. Unlike `finishAllScheduledFunctions(vi.runAllTimers)`, it never jumps ahead to work
 * booked for later, such as the fetch scheduler's next run (FEE-55), which always exists while
 * any Feed does. That run is never started here: tests call `scheduleDue` themselves.
 */
export async function runScheduledNow(t: TestConvex<SchemaDefinition<GenericSchema, boolean>>, maxRounds = 200) {
  for (let round = 0; round < maxRounds; round++) {
    await vi.advanceTimersByTimeAsync(1);
    await t.finishInProgressScheduledFunctions();
    const waiting = await t.run(async (ctx) =>
      (await ctx.db.system.query('_scheduled_functions').collect()).filter(
        (job) =>
          // The fetch scheduler's own booked run is left to the test, which calls `scheduleDue` itself.
          job.name !== FETCH_SCHEDULER &&
          (job.state.kind === 'inProgress' || (job.state.kind === 'pending' && job.scheduledTime <= Date.now())),
      ),
    );
    if (waiting.length === 0) return;
  }
  const left = await t.run(async (ctx) =>
    (await ctx.db.system.query('_scheduled_functions').collect())
      .filter((job) => job.state.kind === 'inProgress' || job.state.kind === 'pending')
      .map((job) => `${job.name} ${job.state.kind} at ${job.scheduledTime - Date.now()}ms`),
  );
  throw new Error(`runScheduledNow: still running after ${maxRounds} rounds: ${left.join('; ')}`);
}
