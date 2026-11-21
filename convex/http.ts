import { httpRouter } from 'convex/server';

import { httpAction } from './_generated/server';

const http = httpRouter();

// Hands the one-time sign-in code to the app. The target is fixed, never taken
// from the request, so this can't be used as an open redirect. The code is useless
// without the state the app saved when it started signing in.
http.route({
  path: '/auth/app',
  method: 'GET',
  handler: httpAction(async (_ctx, request) => {
    const from = new URL(request.url).searchParams;
    const to = new URLSearchParams();
    for (const key of ['convexAuthCode', 'convexAuthError']) {
      const value = from.get(key);
      if (value !== null) to.set(key, value);
    }
    return new Response(null, { status: 302, headers: { Location: `feedsmith://auth?${to}` } });
  }),
});

export default http;
