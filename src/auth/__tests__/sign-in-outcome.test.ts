import { ConvexError } from 'convex/values';

import { signInOutcome } from '@/auth/sign-in-outcome';

describe('what a sign-in attempt shows', () => {
  test('a completed sign-in signs the User in', () => {
    expect(signInOutcome({ status: 'complete' })).toEqual({ status: 'idle' });
  });

  test('an account off the allowlist is told it can’t use feedSmith', () => {
    const refused = { status: 'error' as const, userError: { error: 'OTHER_ERROR', cause: new ConvexError('NOT_ALLOWED') } };
    expect(signInOutcome(refused)).toEqual({ status: 'error', kind: 'not-allowed' });
  });

  test('cancelling at Google is not a failure', () => {
    expect(signInOutcome({ status: 'error', userError: { error: 'ACCESS_DENIED' } })).toEqual({ status: 'idle' });
  });

  test.each(['EXPIRED', 'INVALID_FLOW'])('%s asks to try again', (error) => {
    expect(signInOutcome({ status: 'error', userError: { error } })).toEqual({ status: 'error', kind: 'failed' });
  });

  test('a network or server failure asks to try again', () => {
    const offline = { status: 'error' as const, userError: { error: 'OTHER_ERROR', cause: new TypeError('Network request failed') } };
    expect(signInOutcome(offline)).toEqual({ status: 'error', kind: 'failed' });
  });

  test('an error carried back in the return link is read the same way', () => {
    expect(signInOutcome({ status: 'error', userError: { error: 'ACCESS_DENIED' } })).toEqual({ status: 'idle' });
    expect(signInOutcome({ status: 'error', userError: { error: 'OTHER_ERROR', cause: 'server_error' } })).toEqual({
      status: 'error',
      kind: 'failed',
    });
  });
});
