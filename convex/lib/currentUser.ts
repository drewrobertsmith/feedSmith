import { getAuthUserId } from '@convex-dev/auth/server';
import { ConvexError } from 'convex/values';

import type { Id } from '../_generated/dataModel';
import type { QueryCtx } from '../_generated/server';

/**
 * The signed-in user, or a refusal. Every public function that touches a user's data
 * starts here, and reads and writes only that user's rows (Q10).
 */
export async function requireUserId(ctx: QueryCtx): Promise<Id<'users'>> {
  const userId = await getAuthUserId(ctx);
  if (userId === null) throw new ConvexError('SIGNED_OUT');
  return userId;
}
