import { AppText } from '@/components/app-text';
import { DepthPressable } from '@/components/depth-pressable';

/**
 * A quiet button for a screen's main action: a soft object (D27), not Gold, since Gold marks only
 * what's active or yours (D5). Its label identifies it, at 4.5:1 on its face (Q14, D26).
 */
export function AppButton({
  label,
  onPress,
  disabled = false,
  busy = false,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  busy?: boolean;
}) {
  const off = disabled || busy;
  return (
    <DepthPressable
      level="soft"
      role="button"
      aria-label={label}
      aria-disabled={off}
      aria-busy={busy}
      disabled={off}
      onPress={onPress}
      className={off ? 'self-start rounded-full px-group py-related opacity-60' : 'self-start rounded-full px-group py-related'}
    >
      <AppText variant="label" className="text-text">
        {label}
      </AppText>
    </DepthPressable>
  );
}
