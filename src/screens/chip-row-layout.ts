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

/** Which ends of the scrolling chip row fade: an end fades while more chips lie past it (FEE-44). */
export function edgeFades(scrollX: number, width: number, contentWidth: number) {
  const overflows = width > 0 && contentWidth > width + 1;
  return { start: overflows && scrollX > 1, end: overflows && scrollX + width < contentWidth - 1 };
}
