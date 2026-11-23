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
  reading: { fontFamily: 'Literata', fontWeight: '400', fontSize: 19, lineHeight: 31 },
  /** An Article's headline: the Reading view's one large element. */
  headline: { fontFamily: 'Literata', fontWeight: '600', fontSize: 30, lineHeight: 38 },
  /** An Article's Subtitle under its headline. */
  deck: { fontFamily: 'Literata', fontWeight: '400', fontSize: 20, lineHeight: 30 },
  /** A heading inside an Article's text. */
  subhead: { fontFamily: 'Literata', fontWeight: '600', fontSize: 22, lineHeight: 30 },
} as const satisfies Record<string, TextStyle>;

export type TypeVariant = keyof typeof typeScale;
