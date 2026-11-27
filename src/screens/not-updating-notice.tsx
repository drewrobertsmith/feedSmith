import { useState } from 'react';
import { View } from 'react-native';

import { AppButton } from '@/components/app-button';
import { AppText } from '@/components/app-text';
import { useMinuteClock } from '@/environment';
import { useTryAgain, type FeedChip } from '@/feeds/feeds-data';
import { publishedDate } from '@/feeds/format';
import { openLink } from '@/feeds/open-link';
import { notUpdating } from '@/screens/chip-row-layout';
import { notUpdatingReason } from '@/screens/not-updating-reason';
import { NewAddressSheet } from '@/screens/add-feed-sheet';

/**
 * The top of a Feed's page (FEE-127): when it has failed every try for a day, a quiet notice says since when and
 * why, then its fixes (Try again, FEE-128, then Open site), with Remove last, in brick, behind a divider (Q32); with
 * no Articles, the empty line follows. Key it by the Feed, so one Feed's Try again never shows on another's page.
 * New address (FEE-129) opens its sheet over the page; `newAddressOpen` opens it at once, for the state gallery.
 * `onFeed` shows the Feed a new address led to: this one, or another that already uses it (T22).
 * Its Articles stay below (Q7, Q36). It reads the minute clock itself, so the Feeds screen doesn't (FEE-106).
 * Nothing here moves (Q17).
 */
export function FeedPageTop({
  chip,
  empty,
  onRemove,
  onFeed,
  newAddressOpen = false,
}: {
  chip: FeedChip;
  empty: boolean;
  onRemove: () => void;
  onFeed: (feedId: string) => void;
  newAddressOpen?: boolean;
}) {
  const now = useMinuteClock();
  const failing = notUpdating(chip, now) ? chip.failing : undefined;
  const { trying, tryAgain } = useTryAgain(chip.id);
  const [moving, setMoving] = useState(newAddressOpen);
  const moved = (feedId: string) => {
    setMoving(false);
    onFeed(feedId);
  };
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
          {/* The fixes share a row, wrapping at large text sizes. */}
          <View className="flex-row flex-wrap gap-related">
            <AppButton label="Try again" busyLabel="Trying again…" busy={trying} onPress={tryAgain} />
            <AppButton label="New address" onPress={() => setMoving(true)} />
            {failing.siteUrl ? <AppButton label="Open site" onPress={() => openLink(failing.siteUrl!)} /> : null}
          </View>
          <View className="h-px bg-decor" />
          <NewAddressSheet feed={chip} open={moving} onClose={() => setMoving(false)} onFeed={moved} />
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
