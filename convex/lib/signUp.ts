/**
 * Who may create an account (T15): a Google-verified email on the sign-up allowlist,
 * a comma-separated list in the AUTH_ALLOWED_EMAILS environment variable. No code
 * names a particular person; opening feedSmith to others changes the variable.
 */
export function canSignUp(
  profile: { email?: string; emailVerified: boolean },
  allowlist: string | undefined,
): boolean {
  const email = profile.email?.trim().toLowerCase();
  if (!email || !profile.emailVerified) return false;
  return (allowlist ?? '')
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .includes(email);
}
