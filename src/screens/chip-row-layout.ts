/** A chip's label is at most this many characters, so one long name can't fill the row (FEE-44). */
export const CHIP_LABEL_CHARS = 16;

/**
 * A Feed's name as its chip shows it: as it is when short, else cut at the last word that fits
 * (or mid-word, when one word is too long) with an ellipsis. TalkBack still hears the full name.
 */
export function chipLabel(title: string, max = CHIP_LABEL_CHARS): string {
  if (title.length <= max) return title;
  const space = title.slice(0, max + 1).lastIndexOf(' ');
  const cut = space > max / 2 ? title.slice(0, space) : title.slice(0, max);
  return `${cut.trimEnd()}…`;
}

/**
 * Where the chip row's fades turn on, as scroll positions (FEE-44): the start fades in over the first `fade` of
 * scroll, the end fades out over the last. Null when every chip fits, or before the row has measured itself.
 */
export function fadeRanges(width: number, contentWidth: number, fade: number) {
  const max = contentWidth - width;
  if (width <= 0 || max <= 1) return null;
  return { start: [0, fade], end: [max - fade, max] };
}

/**
 * Where to scroll so the chosen chip sits wholly clear of the fades, an `edge` from the row's start; null when it
 * already does (FEE-44). The start fade only shows once the row is scrolled.
 */
export function revealOffset(
  chip: { x: number; width: number },
  at: { scrollX: number; width: number; fade: number; edge: number },
): number | null {
  const left = at.scrollX <= 1 ? 0 : at.scrollX + at.fade;
  const right = at.scrollX + at.width - at.fade;
  if (chip.x >= left && chip.x + chip.width <= right) return null;
  return Math.max(0, chip.x - at.edge);
}

/** A theme colour, fully transparent: the fade's far end. Theme colours are `#RRGGBB` (src/theme/tokens.ts). */
export function transparent(colour: string): string {
  if (!/^#[0-9a-f]{6}$/i.test(colour)) throw new Error(`The chip row's fade needs a #RRGGBB colour, not ${colour}`);
  return `${colour}00`;
}
