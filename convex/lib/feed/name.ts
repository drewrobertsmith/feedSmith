/** Where a site's name ends and its tagline begins: " – ", " | ", ": " and the like. */
const TAGLINE = /\s[-|–—:·]\s|:\s/;
/** Where a name ends and its byline begins: "Stratechery by Ben Thompson". */
const BYLINE = /\sby\s/i;

/** A site's name before its tagline ("Blog – Notes on things" → "Blog"). */
export function beforeTagline(site: string): string {
  return site.split(TAGLINE)[0];
}

/** A name before its byline ("Stratechery by Ben Thompson" → "Stratechery"). */
export function beforeByline(name: string): string {
  return name.split(BYLINE)[0];
}

/**
 * The name a page's <title> gives a site (FEE-89): the part before its tagline and byline, so "Pluralistic:
 * Daily links from…" names "Pluralistic". A title with neither is kept whole, and so is one that would cut to
 * nothing. Name matching (`nameForms`, FEE-80) cuts the same way, so what's matched and what's shown agree.
 */
export function nameFromTitle(title: string): string {
  const name = beforeByline(beforeTagline(title)).trim();
  return name || title;
}
