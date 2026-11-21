// SPIKE (FEE-21): the sign-in return link lands here with the one-time code.
import { useSignInWithGoogle } from '@convex-dev/auth/methods/google/react';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';

import { api } from '../../convex/_generated/api';

export default function AuthReturn() {
  const params = useLocalSearchParams<{ convexAuthCode?: string; convexAuthError?: string }>();
  const { signIn } = useSignInWithGoogle(api.auth);

  useEffect(() => {
    console.log(`[spike] auth route: code=${params.convexAuthCode ? 'yes' : 'no'} error=${params.convexAuthError ?? '-'} keys=${Object.keys(params).join(',')}`);
    const code = params.convexAuthCode;
    if (!code) return;
    void signIn({ code }).then((result) => {
      console.log(`[spike] complete: ${JSON.stringify(result).slice(0, 160)}`);
      router.replace('/');
    });
  }, [params.convexAuthCode, params.convexAuthError, signIn]);

  return null;
}
