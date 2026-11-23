import { SymbolView, type SymbolViewProps } from 'expo-symbols';

import { useEnvironment, useSizeScale } from '@/environment';

/**
 * A symbol (Material Symbols on Android) that grows with the type and is never clipped (FEE-39, Q16).
 *
 * On Android, `SymbolView` draws its glyph as text in a box of `size`, so Android's font size grows
 * the glyph but not the box, and the glyph's edges are cut off. Here the glyph is sized for the
 * world's font scale and Android adds its own, while the box gets both from `useSizeScale`, so the
 * two always match. `size` is the symbol's size at the default font size, and it sets the box: a
 * `style` width or height is overridden. A lint rule keeps every symbol in the app drawn here (D31).
 */
export function AppSymbol({ size, style, ...props }: Omit<SymbolViewProps, 'size'> & { size: number }) {
  const { fontScale } = useEnvironment();
  const box = size * useSizeScale();
  return <SymbolView {...props} size={size * fontScale} style={[style, { width: box, height: box }]} />;
}
