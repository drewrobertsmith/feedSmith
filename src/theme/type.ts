import type { TextStyle } from 'react-native';

/**
 * The type scale (D6). Instrument Sans carries the interface; Literata, drawn for long
 * reading on screens, carries reading text. Family names are the Android XML font
 * families the expo-font plugin embeds (app.json), so `fontWeight` picks the file.
 */
export const typeScale = {
  title: { fontFamily: 'InstrumentSans', fontWeight: '600', fontSize: 24, lineHeight: 30 },
  body: { fontFamily: 'InstrumentSans', fontWeight: '400', fontSize: 16, lineHeight: 24 },
  label: { fontFamily: 'InstrumentSans', fontWeight: '500', fontSize: 13, lineHeight: 18 },
  reading: { fontFamily: 'Literata', fontWeight: '400', fontSize: 19, lineHeight: 31 },
} as const satisfies Record<string, TextStyle>;

export type TypeVariant = keyof typeof typeScale;
