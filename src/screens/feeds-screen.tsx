import { LegendList, type LegendListRef } from '@legendapp/list/react-native';
import { router } from 'expo-router';
import { useEffect, useRef, useState, type RefObject } from 'react';
import { Alert, RefreshControl, ToastAndroid, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppButton } from '@/components/app-button';
import { AppText } from '@/components/app-text';
import { ChipSwitch, SlideRow, useChipSwitch } from '@/components/chip-switch';
import { ArticleRow } from '@/components/article-row';
import { ArrivalProvider, ArrivingRow, useArrival } from '@/components/arriving-row';
import { TopBar, TopBarIcon } from '@/components/top-bar';
import { useEnvironment } from '@/environment';
import { useAll, useChips, useOffline, useRefresh, useRemoveFeed, type FeedChip } from '@/feeds/feeds-data';
import { useNewArticles } from '@/feeds/use-new-articles';
import { useShownRows } from '@/feeds/use-shown-rows';
import { usePlaceKeeper } from '@/navigation/place-context';
import { AccountButton } from '@/screens/account/account-sheet';
import { AddFeedSheet } from '@/screens/add-feed-sheet';
import { ChipRow } from '@/screens/chip-row';
import { NewArticlesNote } from '@/screens/new-articles-note';
import { FeedPageTop } from '@/screens/not-updating-notice';
import { FeedsUpdatedLine } from '@/screens/updated-line';
import { spacing } from '@/theme/spacing';
import { themes } from '@/theme/tokens';

/**
 * Removing a Feed (FEE-97, T23): Android's dialog asks first (Q32), saying its Articles go too. Once it's
 * gone, Feeds shows All (`onRemoved`); a remove that didn't reach the server says so and changes nothing (Q5).
 */
function useConfirmRemove(onRemoved: () => void) {
  const remove = useRemoveFeed();
  const removeFeed = async (chip: FeedChip) => {
    if ((await remove(chip.id)) === 'failed') ToastAndroid.show(`Couldn't remove ${chip.title}. Try again.`, ToastAndroid.SHORT);
    else onRemoved();
  };
  return (chip: FeedChip) =>
    Alert.alert(`Remove ${chip.title}?`, 'Its Articles go too.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => void removeFeed(chip) },
    ]);
}

/** Offline, a pull asks for nothing: the spinner ends at once and the line says why (FEE-32). */
const ignorePull = () => {};

/**
 * Pulling down (P15), unless the app is offline (FEE-32, Q5): then a pull can't reach the server, so nothing
 * is asked and no spinner waits for it, and the line under the title says why.
 */
function usePullUnlessOffline() {
  const { refreshing, refresh } = useRefresh();
  const offline = useOffline();
  return { refreshing: refreshing && !offline, onRefresh: offline ? ignorePull : refresh, offline };
}

/**
 * Your place in Feeds (FEE-130, Q4): the chip you're on and how far down its list, kept in memory and written when
 * the app leaves the screen (Q21). The list's Articles arrive after it opens, so a restored place is scrolled to
 * once there's room for it.
 */
function useListPlace(list: RefObject<LegendListRef | null>, selection: string | null, startAtOffset: number | undefined) {
  const keeper = usePlaceKeeper();
  const pending = useRef(startAtOffset ?? 0);
  useEffect(() => {
    keeper.update({ feed: selection ?? undefined });
  }, [keeper, selection]);
  return {
    onScroll: (offset: number) => keeper.update({ listOffset: offset }),
    onContentSizeChange: (_width: number, height: number) => {
      if (pending.current > 0 && height > pending.current) {
        list.current?.scrollToOffset({ offset: pending.current, animated: false });
        pending.current = 0;
      }
    },
  };
}

/** A row's usual height, for the list's first layout before rows measure themselves. */
const ESTIMATED_ROW = 112;

/** How near the top still counts as at the top, where new Articles are in view (FEE-102). */
const AT_TOP = spacing.related;

/**
 * The Feeds section: All, or one Feed's Articles, newest first (Q1, P5, P12), under the chip
 * row (P9). The chosen chip lives in the route (`?feed=`), so it can be restored and linked to;
 * a link's value is untrusted, so anything but one of the User's chips means All (Q25).
 * Adding a Feed is a sheet over it (FEE-45); removing one is in its chip's menu (FEE-97). New Articles that
 * arrive while you're scrolled down wait above you, your place held, with a note to go to them (FEE-102).
 * `startAtOffset` opens the list where you left it (FEE-130). `accountOpen`, `addOpen`, `menuFor` and `startAtRow`
 * open the Account sheet, the add sheet or a chip's menu
 * at once, or start the list scrolled to a row, for the state gallery.
 */
export function FeedsScreen({
  feed,
  accountOpen,
  addOpen = false,
  menuFor,
  startAtRow,
  startAtOffset,
}: {
  feed?: string;
  accountOpen?: boolean;
  addOpen?: boolean;
  menuFor?: string;
  startAtRow?: number;
  startAtOffset?: number;
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
  const { colorScheme, reduceMotion } = useEnvironment();
  // The rows on screen: the old chip's stay while they leave, so everything below reads what's shown (FEE-116).
  const { shown, slide } = useChipSwitch(useShownRows(all, chipIndex), reduceMotion);
  // All mixes Feeds, so its rows name theirs; one Feed's chip already names it (P20).
  const rowsNameFeeds = order[shown.index] === '';
  // Scrolled down, new Articles wait above you, and the list holds your place (FEE-102); at the top they're in view.
  const list = useRef<LegendListRef>(null);
  const [atTop, setAtTop] = useState(startAtRow === undefined && startAtOffset === undefined);
  // Scrolling sets state only when it crosses the top, never on every frame (FEE-102).
  const atTopRef = useRef(atTop);
  const trackTop = (offset: number) => {
    const top = offset <= AT_TOP;
    if (top === atTopRef.current) return;
    atTopRef.current = top;
    setAtTop(top);
  };
  const newArticles = useNewArticles(order[shown.index] ?? '', shown.articles, atTop);
  const shownIds = shown.articles.map((article) => article.id);
  const arrival = useArrival(list, shownIds, newArticles.arrived);
  const goToTop = () => {
    newArticles.clear();
    list.current?.scrollToOffset({ offset: 0, animated: !reduceMotion });
  };
  const { refreshing, onRefresh, offline } = usePullUnlessOffline();
  const theme = themes[colorScheme];
  const noFeeds = chipsView.status === 'ready' && chips.length === 0;
  const empty = all.status === 'ready' && all.articles.length === 0;

  const select = (feedId: string | null) => router.setParams({ feed: feedId ?? undefined });
  const listPlace = useListPlace(list, selection, startAtOffset);
  const [adding, setAdding] = useState(addOpen);
  const addFeed = () => setAdding(true);
  // A Feed added, or one already followed: the sheet closes on its chip (FEE-45, T22).
  const showFeed = (feedId: string) => {
    setAdding(false);
    select(feedId);
  };
  const confirmRemove = useConfirmRemove(() => select(null));
  const addSheet = <AddFeedSheet open={adding} onClose={() => setAdding(false)} onFeed={showFeed} />;

  const header = (
    <View className="gap-group pb-related" style={{ paddingTop: insets.top + spacing.section }}>
      <TopBar
        title="Feeds"
        summary={<FeedsUpdatedLine refreshing={refreshing} offline={offline} />}
        // Adding a Feed is always here, in the same place (Q31, D18); the empty state has its own button.
        action={chips.length > 0 ? <TopBarIcon label="Add a Feed" icon={{ ios: 'plus', android: 'add' }} onPress={addFeed} /> : undefined}
        trailing={<AccountButton initiallyOpen={accountOpen} />}
      />
      {chips.length > 0 ? (
        <ChipRow chips={chips} selected={selection} onSelect={select} onRemove={confirmRemove} menuFor={menuFor} />
      ) : null}
      {selectedChip && selection === selectedChip.id ? (
        // A Feed's page: whether it's not updating (FEE-127), and never a dead end when it has no Articles (Q34).
        <FeedPageTop key={selectedChip.id} chip={selectedChip} empty={empty} onRemove={() => confirmRemove(selectedChip)} />
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
    <View className="flex-1 bg-background">
      <ChipSwitch index={shown.index} slide={slide}>
        <ArrivalProvider value={arrival}>
        <LegendList
          ref={list}
          testID="all-list"
          data={shown.articles}
          // Your place holds when Articles arrive above you; at the top they push in, in view (FEE-102).
          maintainVisibleContentPosition={{ data: !atTop }}
          initialScrollIndex={startAtRow}
          initialScrollOffset={startAtOffset}
          onContentSizeChange={listPlace.onContentSizeChange}
          onScroll={(event) => {
            trackTop(event.nativeEvent.contentOffset.y);
            listPlace.onScroll(event.nativeEvent.contentOffset.y);
          }}
          keyExtractor={(article) => article.id}
          renderItem={({ item }) => (
            <SlideRow>
              <ArrivingRow id={item.id}>
                <ArticleRow article={item} feedNamed={rowsNameFeeds} />
              </ArrivingRow>
            </SlideRow>
          )}
          estimatedItemSize={ESTIMATED_ROW}
          // Rows hold small state (a favicon that failed): a reused row must start fresh.
          recycleItems={false}
          ListHeaderComponent={header}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              progressViewOffset={insets.top}
              colors={[theme.accent]}
              progressBackgroundColor={theme.surface}
            />
          }
          className="flex-1 bg-background"
          contentContainerStyle={{ paddingBottom: insets.bottom + spacing.section }}
        />
        </ArrivalProvider>
      </ChipSwitch>
      {newArticles.waiting ? <NewArticlesNote onPress={goToTop} /> : null}
      {addSheet}
    </View>
  );
}
