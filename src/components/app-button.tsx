import { View } from 'react-native';

import { AppText } from '@/components/app-text';
import { DepthPressable } from '@/components/depth-pressable';

/**
 * A quiet button for a screen's main action: a soft object (D27), not Gold, since Gold marks only
 * what's active or yours (D5). Its label identifies it, at 4.5:1 on its face (Q14, D26).
 */
export function AppButton({
  label,
  accessibleName = label,
  onPress,
  disabled = false,
  busy = false,
  busyLabel,
  tone = 'plain',
}: {
  label: string;
  /** `destructive` colours the label brick: it removes something for good (Q30, D19). */
  tone?: 'plain' | 'destructive';
  /** What TalkBack hears, when the label alone is too short out of context (Q15). Starts with the label. */
  accessibleName?: string;
  onPress: () => void;
  disabled?: boolean;
  busy?: boolean;
  /**
   * What it says while busy (FEE-128), the longer of the two. The button keeps room for it, so its width, and
   * whatever sits beside it, never moves.
   */
  busyLabel?: string;
}) {
  const off = disabled || busy;
  const colour = tone === 'destructive' ? 'text-destructive' : 'text-text';
  return (
    <DepthPressable
      level="soft"
      role="button"
      aria-label={busy && busyLabel ? busyLabel : accessibleName}
      aria-disabled={off}
      aria-busy={busy}
      disabled={off}
      onPress={onPress}
      frameClassName="self-start"
      className={off ? 'rounded-full px-group py-related opacity-60' : 'rounded-full px-group py-related'}
    >
      {busyLabel ? (
        // Both labels lie in one cell, centred; only the one that applies shows, and only it is heard.
        <View>
          <AppText variant="label" aria-hidden={!busy} className={`text-center ${colour} ${busy ? '' : 'opacity-0'}`}>
            {busyLabel}
          </AppText>
          <AppText variant="label" aria-hidden={busy} className={`absolute inset-x-0 text-center ${colour} ${busy ? 'opacity-0' : ''}`}>
            {label}
          </AppText>
        </View>
      ) : (
        <AppText variant="label" className={colour}>
          {label}
        </AppText>
      )}
    </DepthPressable>
  );
}
