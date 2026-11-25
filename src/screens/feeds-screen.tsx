import { LegendList } from '@legendapp/list/react-native';
import { router } from 'expo-router';
import { useState } from 'react';
import { RefreshControl, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppButton } from '@/components/app-button';
import { AppText } from '@/components/app-text';
import { SharedTitleScreen } from '@/components/shared-title';
import { ChipSwitch, SlideRow } from '@/components/chip-switch';
import { ArticleRow } from '@/components/article-row';
import { TopBar, TopBarIcon } from '@/components/top-bar';
import { useEnvironment, useMinuteClock } from '@/environment';
import { useAll, useChips, useLastUpdated, useRefresh } from '@/feeds/feeds-data';
import { publishedAgo } from '@/feeds/format';
import { useShownRows } from '@/feeds/use-shown-rows';
import { AccountButton } from '@/screens/account/account-sheet';
import { AddFeedSheet } from '@/screens/add-feed-sheet';
import { ChipRow } from '@/screens/chip-row';
import { spacing } from '@/theme/spacing';
import { themes } from '@/theme/tokens';

const manageFeeds = () => router.push('/manage-feeds');

/**
 * The line under the Feeds title (FEE-47): how fresh All is, so you know whether pulling down is
 * worth it. Information, not a count (P7). Nothing until there's something to say.
 */
function useUpdatedLine(refreshing: boolean): string | undefined {
  const lastUpdated = useLastUpdated();
  const now = useMinuteClock();
  if (refreshing) return 'Updating…';
  if (lastUpdated.status !== 'ready' || lastUpdated.at === null) return undefined;
  return `Updated ${publishedAgo(lastUpdated.at, now)}`;
}

/** A row's usual height, for the list's first layout before rows measure themselves. */
const ESTIMATED_ROW = 112;

/**
 * The Feeds section: All, or one Feed's Articles, newest first (Q1, P5, P12), under the chip
 * row (P9). The chosen chip lives in the route (`?feed=`), so it can be restored and linked to;
 * a link's value is untrusted, so anything but one of the User's chips means All (Q25).
 * Adding a Feed is a sheet over it (FEE-45). `accountOpen` and `addOpen` open the Account sheet or
 * the add sheet at once, for the state gallery.
 */
export function FeedsScreen({
  feed,
  accountOpen,
  addOpen = false,
}: {
  feed?: string;
  accountOpen?: boolean;
  addOpen?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const chipsView = useChips();
  const chips = chipsView.status === 'ready' ? chipsView.chips : [];
  // All or one of the User's Feeds; anything else in a link, `pinned` included (FEE-94), means All (Q25).
  const selectedChip = chips.find((chip) => chip.id === feed) ?? null;
  const selection = selectedChip?.id ?? null;
  const all = useAll(selection);
  // The chosen chip's place in the row: All is 0, then each chip in order.
  const order = ['', ...chips.map((chip) => chip.id)];
  const chipIndex = order.indexOf(selection ?? '');
  // What the list shows: the last ready rows while a newly chosen Feed's load (FEE-42).
  const shown = useShownRows(all, chipIndex);
  // All mixes Feeds, so its rows name theirs; one Feed's chip already names it (P20).
  const rowsNameFeeds = order[shown.index] === '';
  const { refreshing, refresh } = useRefresh();
  const updated = useUpdatedLine(refreshing);
  const { colorScheme } = useEnvironment();
  const theme = themes[colorScheme];
  const noFeeds = chipsView.status === 'ready' && chips.length === 0;
  const empty = all.status === 'ready' && all.articles.length === 0;

  const select = (feedId: string | null) => router.setParams({ feed: feedId ?? undefined });
  const [adding, setAdding] = useState(addOpen);
  const addFeed = () => setAdding(true);
  // A Feed added, or one already followed: the sheet closes on its chip (FEE-45, T22).
  const showFeed = (feedId: string) => {
    setAdding(false);
    select(feedId);
  };
  const addSheet = <AddFeedSheet open={adding} onClose={() => setAdding(false)} onFeed={showFeed} />;

  const header = (
    <View className="gap-group pb-related" style={{ paddingTop: insets.top + spacing.section }}>
      <TopBar
        title="Feeds"
        summary={updated}
        // Adding a Feed is always here, in the same place (Q31, D18); the empty state has its own button.
        action={chips.length > 0 ? <TopBarIcon label="Add a Feed" icon={{ ios: 'plus', android: 'add' }} onPress={addFeed} /> : undefined}
        trailing={<AccountButton initiallyOpen={accountOpen} />}
      />
      {chips.length > 0 ? <ChipRow chips={chips} selected={selection} onSelect={select} /> : null}
      {selectedChip && selection === selectedChip.id && empty ? (
        // Never a dead end (Q34): a quiet way to check the Feed, rename it or remove it.
        <View className="gap-group px-edge">
          <AppText variant="reading" className="text-text-muted">
            {`No Articles from ${selectedChip.title} yet.`}
          </AppText>
          <AppButton label="Manage this Feed" onPress={manageFeeds} />
        </View>
      ) : null}
    </View>
  );

  if (noFeeds) {
    return (
      <View className="flex-1 bg-background">
        {header}
        <View className="gap-group px-edge pt-group">
          <AppText variant="reading" className="text-text-muted">
            Add a Feed to see its Articles here.
          </AppText>
          <AppButton label="Add a Feed" onPress={addFeed} />
        </View>
        {addSheet}
      </View>
    );
  }

  return (
    // Only the screen in front carries titles (FEE-48).
    <SharedTitleScreen>
      <View className="flex-1 bg-background">
      <ChipSwitch index={shown.index}>
        <LegendList
          testID="all-list"
          data={shown.articles}
          keyExtractor={(article) => article.id}
          renderItem={({ item }) => (
            <SlideRow>
              <ArticleRow article={item} feedNamed={rowsNameFeeds} />
            </SlideRow>
          )}
          estimatedItemSize={ESTIMATED_ROW}
          // Rows hold small state (a favicon that failed): a reused row must start fresh.
          recycleItems={false}
          ListHeaderComponent={header}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={refresh}
              progressViewOffset={insets.top}
              colors={[theme.accent]}
              progressBackgroundColor={theme.surface}
            />
          }
          className="flex-1 bg-background"
          contentContainerStyle={{ paddingBottom: insets.bottom + spacing.section }}
        />
      </ChipSwitch>
      {addSheet}
      </View>
    </SharedTitleScreen>
  );
}
