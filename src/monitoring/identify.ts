import { setUser } from '@sentry/react-native';

/**
 * Names the signed-in User on crash reports by their opaque Convex id, never their email or name, or no one when
 * signed out (T50). With PII on (T16) Sentry still adds the IP address; deleting an Account doesn't reach it (Q28).
 */
export function identify(userId: string | null) {
  setUser(userId === null ? null : { id: userId });
}
