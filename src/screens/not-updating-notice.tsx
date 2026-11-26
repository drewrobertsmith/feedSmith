import { View } from 'react-native';

import { AppButton } from '@/components/app-button';
import { AppText } from '@/components/app-text';
import { useMinuteClock } from '@/environment';
import type { FeedChip } from '@/feeds/feeds-data';
import { publishedDate } from '@/feeds/format';
import { openLink } from '@/feeds/open-link';
import { notUpdating } from '@/screens/chip-row-layout';
import { notUpdatingReason } from '@/screens/not-updating-reason';

/**
 * The top of a Feed's page (FEE-127): when it has failed every try for a day, a quiet notice says since when and
 * why, then its fixes, with Remove last, in brick, behind a divider (Q32); with no Articles, the empty line follows.
 * Its Articles stay below (Q7, Q36). It reads the minute clock itself, so the Feeds screen doesn't (FEE-106).
 * Nothing here moves (Q17).
 */
export function FeedPageTop({ chip, empty, onRemove }: { chip: FeedChip; empty: boolean; onRemove: () => void }) {
  const now = useMinuteClock();
  const failing = notUpdating(chip, now) ? chip.failing : undefined;
  const remove = <AppButton label={`Remove ${chip.title}`} tone={failing ? 'destructive' : 'plain'} onPress={onRemove} />;
  if (!failing && !empty) return null;
  return (
    <View className="gap-group px-edge pb-group">
      {failing ? (
        <>
          <View className="gap-inside">
            <AppText variant="label" className="text-text">
              {`Not updating since ${publishedDate(failing.since)}`}
            </AppText>
            <AppText variant="label" className="text-text-muted">
              {notUpdatingReason(failing.reason)}
            </AppText>
          </View>
          {failing.siteUrl ? <AppButton label="Open site" onPress={() => openLink(failing.siteUrl!)} /> : null}
          <View className="h-px bg-decor" />
        </>
      ) : null}
      {empty ? (
        <AppText variant="reading" className="text-text-muted">
          {`No Articles from ${chip.title} yet.`}
        </AppText>
      ) : null}
      {/* Never a dead end (Q34): one Remove, after any fixes. */}
      {remove}
    </View>
  );
}
