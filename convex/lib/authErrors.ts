/** Why the backend turned a caller away. The app reads these to choose what to show. */
export const AUTH_ERRORS = {
  /** The Google account isn't on the sign-up allowlist, or Google hasn't verified its email. */
  notAllowed: 'NOT_ALLOWED',
  /** No one is signed in. */
  signedOut: 'SIGNED_OUT',
} as const;
