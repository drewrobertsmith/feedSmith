import { httpRouter } from 'convex/server';

import { httpAction } from './_generated/server';

/** Where Google's sign-in hands back to the app. Fixed: never taken from the request. */
const APP_RETURN = 'feedsmith://auth';
/** The only parameters passed through: Convex Auth's one-time code, or its error. */
const FORWARDED = ['convexAuthCode', 'convexAuthError'] as const;

const http = httpRouter();

// Convex Auth accepts only http(s) return addresses, so sign-in returns to this
// deployment's own site and this action forwards into the app. The code is useless
// without the state the app saved when it started signing in.
http.route({
  path: '/auth/app',
  method: 'GET',
  handler: httpAction(async (_ctx, request) => {
    const from = new URL(request.url).searchParams;
    const to = new URLSearchParams();
    for (const key of FORWARDED) {
      const value = from.get(key);
      if (value !== null) to.set(key, value);
    }
    return new Response(null, { status: 302, headers: { Location: `${APP_RETURN}?${to}` } });
  }),
});

export default http;
