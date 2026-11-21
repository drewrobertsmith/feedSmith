import { ConvexError } from 'convex/values';

/** What the sign-in screen shows. */
export type SignInView =
  | { status: 'idle' }
  | { status: 'busy' }
  | { status: 'error'; kind: 'not-allowed' | 'failed' };

/** A sign-in result, as Convex Auth's Google method reports it. */
type SignInResult =
  | { status: 'complete' | 'redirect' }
  | { status: 'error'; userError: { error: string; cause?: unknown } };

/**
 * Turns a sign-in result into what the screen shows. A completed sign-in leaves the
 * screen idle: the route guard moves a signed-in User on to Feeds.
 */
export function signInOutcome(result: SignInResult): SignInView {
  if (result.status !== 'error') return { status: 'idle' };
  const { error, cause } = result.userError;
  if (error === 'ACCESS_DENIED') return { status: 'idle' };
  if (cause instanceof ConvexError && cause.data === 'NOT_ALLOWED') return { status: 'error', kind: 'not-allowed' };
  return { status: 'error', kind: 'failed' };
}
