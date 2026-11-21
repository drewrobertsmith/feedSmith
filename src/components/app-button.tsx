import { Pressable } from 'react-native';

import { AppText } from '@/components/app-text';

/**
 * A quiet, filled button for a screen's main action. Surface-coloured, not Gold: Gold marks
 * only what's active or yours (D5).
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
    <Pressable
      role="button"
      aria-label={label}
      aria-disabled={off}
      aria-busy={busy}
      disabled={off}
      onPress={onPress}
      className={off ? 'self-start rounded-full bg-surface px-group py-related opacity-60' : 'self-start rounded-full bg-surface px-group py-related'}
    >
      <AppText variant="label" className="text-text">
        {label}
      </AppText>
    </Pressable>
  );
}
