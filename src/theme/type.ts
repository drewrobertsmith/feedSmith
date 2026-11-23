import type { TextStyle } from 'react-native';

/**
 * The type scale (D6). Instrument Sans carries everything the app says; Literata, drawn for
 * long reading on screens, carries everything an Article's author wrote: its headline,
 * Subtitle (the deck), subheads and text. Family names are the Android XML font families the
 * expo-font plugin embeds (app.json), so `fontWeight` and `fontStyle` pick a real cut.
 */
export const typeScale = {
  title: { fontFamily: 'InstrumentSans', fontWeight: '600', fontSize: 24, lineHeight: 30 },
  label: { fontFamily: 'InstrumentSans', fontWeight: '500', fontSize: 13, lineHeight: 18 },
  /** A row in a menu or sheet that does something: Manage Feeds, Sign out (FEE-35). */
  action: { fontFamily: 'InstrumentSans', fontWeight: '500', fontSize: 16, lineHeight: 24 },
  reading: { fontFamily: 'Literata', fontWeight: '400', fontSize: 19, lineHeight: 31 },
  /** An Article's headline: the Reading view's one large element. */
  headline: { fontFamily: 'Literata', fontWeight: '600', fontSize: 30, lineHeight: 38 },
  /** An Article's Subtitle under its headline. */
  deck: { fontFamily: 'Literata', fontWeight: '400', fontSize: 20, lineHeight: 30 },
  /** An Article's Subtitle in a list row: the author's words, small (FEE-42, Q29). */
  summary: { fontFamily: 'Literata', fontWeight: '400', fontSize: 15, lineHeight: 22 },
  /** A heading inside an Article's text. */
  subhead: { fontFamily: 'Literata', fontWeight: '600', fontSize: 22, lineHeight: 30 },
} as const satisfies Record<string, TextStyle>;

export type TypeVariant = keyof typeof typeScale;
