/**
 * The app's sign-in return link. Fixed, never taken from a request: convex/http.ts
 * forwards Google's sign-in here, and the app opens its in-app browser expecting it.
 */
export const APP_RETURN = 'feedsmith://auth';
