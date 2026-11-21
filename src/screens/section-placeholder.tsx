import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/app-text';
import { spacing } from '@/theme/spacing';

/** A section that has no content yet. The section's own ticket replaces it. */
export function SectionPlaceholder({ title, message }: { title: string; message: string }) {
  const insets = useSafeAreaInsets();

  return (
    <View className="flex-1 gap-related bg-background px-edge" style={{ paddingTop: insets.top + spacing.section }}>
      <AppText variant="title">{title}</AppText>
      <AppText variant="reading" className="text-text-muted">
        {message}
      </AppText>
    </View>
  );
}
