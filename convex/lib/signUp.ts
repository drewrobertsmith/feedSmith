/**
 * The normalised email of an account that may sign up, or null. Who may sign up (T15): a Google-verified email on the sign-up allowlist,
 * a comma-separated list in the AUTH_ALLOWED_EMAILS environment variable. No code
 * names a particular person; opening feedSmith to others changes the variable.
 */
export function allowedSignUpEmail(
  profile: { email?: string; emailVerified: boolean },
  allowlist: string | undefined,
): string | null {
  const email = normaliseEmail(profile.email);
  if (!email || !profile.emailVerified) return null;
  const allowed = (allowlist ?? '').split(',').map(normaliseEmail);
  return allowed.includes(email) ? email : null;
}

function normaliseEmail(email: string | undefined): string {
  return email?.trim().toLowerCase() ?? '';
}
