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
}) {
  const off = disabled || busy;
  return (
    <DepthPressable
      level="soft"
      role="button"
      aria-label={accessibleName}
      aria-disabled={off}
      aria-busy={busy}
      disabled={off}
      onPress={onPress}
      frameClassName="self-start"
      className={off ? 'rounded-full px-group py-related opacity-60' : 'rounded-full px-group py-related'}
    >
      <AppText variant="label" className={tone === 'destructive' ? 'text-destructive' : 'text-text'}>
        {label}
      </AppText>
    </DepthPressable>
  );
}
