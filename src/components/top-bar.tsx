import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { useEnvironment } from '@/environment';
import { spacing } from '@/theme/spacing';
import { themes } from '@/theme/tokens';

const ICON = 24;

/**
 * The top bar every top-level section shares (Q31): a large left-aligned title, then at most two
 * things on the right, the section's own action and `trailing` (the account circle).
 */
export function TopBar({ title, action, trailing }: { title: string; action?: ReactNode; trailing?: ReactNode }) {
  return (
    <View testID={`top-bar-${title}`} className="flex-row items-center justify-between gap-group px-edge">
      <AppText variant="title" className="shrink text-text">
        {title}
      </AppText>
      <View className="flex-row items-center gap-related">
        {action}
        {trailing}
      </View>
    </View>
  );
}

/** An icon button for a top bar, always in the same place (Q31): + to add a Feed. */
export function TopBarIcon({ label, icon, onPress }: { label: string; icon: SymbolViewProps['name']; onPress: () => void }) {
  const { colorScheme } = useEnvironment();
  return (
    <Pressable role="button" aria-label={label} onPress={onPress} hitSlop={spacing.related} className="p-inside">
      <SymbolView name={icon} size={ICON} tintColor={themes[colorScheme].text} />
    </Pressable>
  );
}
