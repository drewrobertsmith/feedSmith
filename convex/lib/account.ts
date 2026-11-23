/**
 * The letter on a User's account circle (P17): their name's first letter, or their email's when
 * Google gave no name. Upper-cased, and a whole character, never half of an emoji.
 */
export function accountInitial(user: { name?: string; email: string }): string {
  const source = user.name?.trim() || user.email.trim();
  return (Array.from(source)[0] ?? '?').toLocaleUpperCase();
}
