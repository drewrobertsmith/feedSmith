/**
 * Whether what was typed in Add a Feed is an address (today's path, T21) or a site's name to
 * search for (FEE-80): an address has a scheme, or has no spaces and a dot between two parts
 * ("theverge.com", "daringfireball.net/feed"). Anything else ("the verge", "theverge") is a name.
 * Shared by the app and the server, so it stays free of server-only imports.
 */
export function isAddress(typed: string): boolean {
  const text = typed.trim();
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(text)) return true;
  return !/\s/.test(text) && /[^.]\.[^.]/.test(text);
}
