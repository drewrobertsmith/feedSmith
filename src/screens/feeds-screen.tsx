import { LegendList } from '@legendapp/list/react-native';
import { router } from 'expo-router';
import { RefreshControl, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppButton } from '@/components/app-button';
import { AppText } from '@/components/app-text';
import { SharedTitleScreen } from '@/components/shared-title';
import { ChipSwitch, SlideRow } from '@/components/chip-switch';
import { ArticleRow } from '@/components/article-row';
import { rowAction } from '@/components/row-action';
import { SwipeRow } from '@/components/swipe-row';
import { TopBar, TopBarIcon } from '@/components/top-bar';
import { UndoToastHost } from '@/components/undo-toast';
import { useEnvironment, useMinuteClock } from '@/environment';
import { useAll, useChips, useLastUpdated, useRefresh } from '@/feeds/feeds-data';
import { PINNED } from '../../convex/lib/pinned';
import { publishedAgo } from '@/feeds/format';
import { useSaveAndDone } from '@/feeds/use-save-and-done';
import { useShownRows } from '@/feeds/use-shown-rows';
import { AccountButton } from '@/screens/account/account-sheet';
import { ChipRow } from '@/screens/chip-row';
import { hasPinnedView } from '@/screens/chip-row-layout';
import { spacing } from '@/theme/spacing';
import { themes } from '@/theme/tokens';

const addFeed = () => router.push('/add-feed');
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
 * `accountOpen` opens the Account sheet at once, for the state gallery.
 */
export function FeedsScreen({ feed, accountOpen }: { feed?: string; accountOpen?: boolean }) {
  const insets = useSafeAreaInsets();
  const chipsView = useChips();
  const chips = chipsView.status === 'ready' ? chipsView.chips : [];
  // With two or more Pinned Feeds, Pinned is a view of its own (FEE-59); with fewer, a link to it means All.
  const pinnedView = hasPinnedView(chips);
  const selectedChip = chips.find((chip) => chip.id === feed) ?? null;
  const selection = feed === PINNED && pinnedView ? PINNED : (selectedChip?.id ?? null);
  const all = useAll(selection);
  // The chosen chip's place in the row: All is 0, then each chip in order.
  const order = ['', ...(pinnedView ? [PINNED] : []), ...chips.map((chip) => chip.id)];
  const chipIndex = order.indexOf(selection ?? '');
  // What the list shows: the last ready rows while a newly chosen Feed's load (FEE-42).
  const shown = useShownRows(all, chipIndex);
  // All and Pinned mix Feeds, so their rows name theirs; one Feed's chip already names it (P20).
  const shownSelection = order[shown.index];
  const rowsNameFeeds = shownSelection === '' || shownSelection === PINNED;
  const { refreshing, refresh } = useRefresh();
  const updated = useUpdatedLine(refreshing);
  const { colorScheme } = useEnvironment();
  const theme = themes[colorScheme];
  const saveOrDone = useSaveAndDone();
  const noFeeds = chipsView.status === 'ready' && chips.length === 0;
  const empty = all.status === 'ready' && all.articles.length === 0;

  const select = (feedId: string | null) => router.setParams({ feed: feedId ?? undefined });

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
      {selection === PINNED && empty ? (
        // Never a dead end (Q34): the Pinned Feeds are chosen in Manage Feeds.
        <View className="gap-group px-edge">
          <AppText variant="reading" className="text-text-muted">
            No Articles from your Pinned Feeds in the last 30 days.
          </AppText>
          <AppButton label="Manage Feeds" onPress={manageFeeds} />
        </View>
      ) : null}
      {selectedChip && selection === selectedChip.id && empty ? (
        // Never a dead end (Q34): a quiet way to check the Feed, rename it or remove it.
        <View className="gap-group px-edge">
          <AppText variant="reading" className="text-text-muted">
            {`No Articles from ${selectedChip.title} in the last 30 days.`}
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
              {/* Save, or Done once Saved: either way the row stays in Feeds, so it springs back. */}
              <SwipeRow
                id={item.id}
                action={rowAction(item)}
                leaves={false}
                onCommit={() => saveOrDone(item.id, rowAction(item), { haptic: false })}
              >
                <ArticleRow article={item} feedNamed={rowsNameFeeds} savedMark onAction={(action) => saveOrDone(item.id, action)} />
              </SwipeRow>
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
      <UndoToastHost />
      </View>
    </SharedTitleScreen>
  );
}
