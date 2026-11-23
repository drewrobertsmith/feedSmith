import { LegendList } from '@legendapp/list/react-native';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { Pressable, RefreshControl, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppButton } from '@/components/app-button';
import { AppText } from '@/components/app-text';
import { ChipSwitch, SlideRow } from '@/components/chip-switch';
import { FeedIcon } from '@/components/feed-icon';
import { TopBar, TopBarIcon } from '@/components/top-bar';
import { useEnvironment } from '@/environment';
import { useAll, useChips, useRefresh, type ArticleRow } from '@/feeds/feeds-data';
import { byline, publishedAgo } from '@/feeds/format';
import { useShownRows } from '@/feeds/use-shown-rows';
import { AccountButton } from '@/screens/account/account-sheet';
import { ChipRow } from '@/screens/chip-row';
import { spacing } from '@/theme/spacing';
import { themes } from '@/theme/tokens';

const addFeed = () => router.push('/add-feed');

/** A Read row's image fades back with its text (P7); text dims by colour, so contrast holds (Q14). */
const READ_IMAGE_OPACITY = 0.55;
const THUMBNAIL = 72;
const FAVICON = 16;
/** A row's usual height, for the list's first layout before rows measure themselves. */
const ESTIMATED_ROW = 112;

/**
 * One Article in the list (P12). Its parts each have one voice (Q29): muted sans meta, the title
 * in Literata, a full-strength sans byline, the Subtitle in small muted Literata. With one Feed
 * chosen, its chip already names it, so `feedNamed` is off and the row leaves the name out.
 */
function Row({ article, feedNamed }: { article: ArticleRow; feedNamed: boolean }) {
  const { colorScheme, fontScale, now } = useEnvironment();
  const ago = publishedAgo(article.publishedAt, now());
  const credit = byline(article.authors);
  const label = [article.title, credit, feedNamed ? article.feedTitle : undefined, ago, article.read ? 'Read' : undefined]
    .filter(Boolean)
    .join(', ');
  const thumbnail = THUMBNAIL * fontScale;

  return (
    <Pressable
      role="link"
      aria-label={label}
      onPress={() => router.push(`/article/${article.id}`)}
      android_ripple={{ color: themes[colorScheme].surface }}
      className="flex-row gap-group px-edge py-group"
    >
      <View className="flex-1 gap-inside">
        <View className="flex-row items-center gap-related">
          {/* Keyed by favicon, so a failed load never carries over to another Feed's row. */}
          <FeedIcon
            key={article.faviconUrl ?? article.feedTitle}
            url={article.faviconUrl}
            title={article.feedTitle}
            size={FAVICON}
            testID="row-favicon"
          />
          {feedNamed ? (
            <AppText testID="row-feed-name" variant="label" className="shrink text-text-muted" numberOfLines={1}>
              {article.feedTitle}
            </AppText>
          ) : null}
          <AppText variant="label" className="text-text-muted">
            {ago}
          </AppText>
        </View>
        <AppText variant="reading" className={article.read ? 'text-text-muted' : 'text-text'}>
          {article.title}
        </AppText>
        {/* Who wrote it, where you decide whether to open it (FEE-41). */}
        {credit ? (
          <AppText variant="label" className={article.read ? 'text-text-muted' : 'text-text'} numberOfLines={1}>
            {credit}
          </AppText>
        ) : null}
        {article.subtitle ? (
          <AppText variant="summary" className="text-text-muted" numberOfLines={2}>
            {article.subtitle}
          </AppText>
        ) : null}
      </View>
      {article.imageUrl ? (
        <View className="overflow-hidden rounded-lg bg-surface" style={{ width: thumbnail, height: thumbnail }}>
          <Image
            testID="row-image"
            source={{ uri: article.imageUrl }}
            accessible={false}
            contentFit="cover"
            recyclingKey={article.id}
            style={{ width: thumbnail, height: thumbnail, opacity: article.read ? READ_IMAGE_OPACITY : 1 }}
          />
        </View>
      ) : null}
    </Pressable>
  );
}

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
  const selectedChip = chips.find((chip) => chip.id === feed) ?? null;
  const all = useAll(selectedChip?.id ?? null);
  // The chosen chip's place in the row: All is 0, then each chip in order.
  const chipIndex = selectedChip ? chips.indexOf(selectedChip) + 1 : 0;
  // What the list shows: the last ready rows while a newly chosen Feed's load (FEE-42).
  const shown = useShownRows(all, chipIndex);
  const { refreshing, refresh } = useRefresh();
  const { colorScheme } = useEnvironment();
  const theme = themes[colorScheme];
  const noFeeds = chipsView.status === 'ready' && chips.length === 0;
  const empty = all.status === 'ready' && all.articles.length === 0;

  const select = (feedId: string | null) => router.setParams({ feed: feedId ?? undefined });

  const header = (
    <View className="gap-group pb-related" style={{ paddingTop: insets.top + spacing.section }}>
      <TopBar
        title="Feeds"
        // Adding a Feed is always here, in the same place (Q31, D18); the empty state has its own button.
        action={chips.length > 0 ? <TopBarIcon label="Add a Feed" icon={{ ios: 'plus', android: 'add' }} onPress={addFeed} /> : undefined}
        trailing={<AccountButton initiallyOpen={accountOpen} />}
      />
      {chips.length > 0 ? <ChipRow chips={chips} selected={selectedChip?.id ?? null} onSelect={select} /> : null}
      {selectedChip && empty ? (
        <AppText variant="reading" className="px-edge text-text-muted">
          {`No Articles from ${selectedChip.title} in the last 30 days.`}
        </AppText>
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
    <ChipSwitch index={shown.index}>
      <LegendList
        testID="all-list"
        data={shown.articles}
        keyExtractor={(article) => article.id}
        renderItem={({ item }) => (
          <SlideRow>
            <Row article={item} feedNamed={shown.index === 0} />
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
  );
}
