import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/app-text';
import { TopBar } from '@/components/top-bar';
import { AccountButton } from '@/screens/account/account-sheet';
import { spacing } from '@/theme/spacing';

/** A section that has no content yet, under the shared top bar (Q31). The section's own ticket replaces it. */
export function SectionPlaceholder({ title, message, accountOpen }: { title: string; message: string; accountOpen?: boolean }) {
  const insets = useSafeAreaInsets();

  return (
    <View className="flex-1 gap-related bg-background" style={{ paddingTop: insets.top + spacing.section }}>
      <TopBar title={title} trailing={<AccountButton initiallyOpen={accountOpen} />} />
      <AppText variant="reading" className="px-edge text-text-muted">
        {message}
      </AppText>
    </View>
  );
}
