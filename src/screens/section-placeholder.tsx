import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/app-text';

/** A section that has no content yet. The section's own ticket replaces it. */
export function SectionPlaceholder({ title, message }: { title: string; message: string }) {
  const insets = useSafeAreaInsets();

  return (
    <View className="flex-1 gap-3 bg-background px-5" style={{ paddingTop: insets.top + 24 }}>
      <AppText variant="title">{title}</AppText>
      <AppText variant="reading" className="text-text-muted">
        {message}
      </AppText>
    </View>
  );
}
