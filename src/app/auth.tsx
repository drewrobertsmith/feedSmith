import { Redirect, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';

import { useAuth } from '@/auth/auth-context';

/**
 * The return link, feedsmith://auth, lands here with Convex Auth's one-time code or
 * its error. Sign-in finishes in the auth provider; the guard then shows the right screen.
 */
export default function AuthReturnRoute() {
  const { convexAuthCode, convexAuthError } = useLocalSearchParams<{ convexAuthCode?: string; convexAuthError?: string }>();
  const { session, completeSignIn } = useAuth();

  useEffect(() => {
    completeSignIn({ code: convexAuthCode, error: convexAuthError });
    // Once per link: the code can only be redeemed once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [convexAuthCode, convexAuthError]);

  return <Redirect href={session === 'signed-in' ? '/' : '/sign-in'} />;
}
