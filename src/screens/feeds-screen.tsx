import { LegendList } from '@legendapp/list/react-native';
import { Image } from 'expo-image';
import { SymbolView } from 'expo-symbols';
import { router } from 'expo-router';
import { Pressable, RefreshControl, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppButton } from '@/components/app-button';
import { AppText } from '@/components/app-text';
import { FeedIcon } from '@/components/feed-icon';
import { useEnvironment } from '@/environment';
import { useAll, useChips, useRefresh, type ArticleRow } from '@/feeds/feeds-data';
import { publishedAgo } from '@/feeds/format';
import { ChipRow } from '@/screens/chip-row';
import { spacing } from '@/theme/spacing';
import { themes } from '@/theme/tokens';

const addFeed = () => router.push('/add-feed');
const manageFeeds = () => router.push('/manage-feeds');
const MANAGE_ICON = 24;

/** A Read row's image fades back with its text (P7); text dims by colour, so contrast holds (Q14). */
const READ_IMAGE_OPACITY = 0.55;
const THUMBNAIL = 72;
const FAVICON = 16;
/** A row's usual height, for the list's first layout before rows measure themselves. */
const ESTIMATED_ROW = 112;

function Row({ article }: { article: ArticleRow }) {
  const { colorScheme, fontScale, now } = useEnvironment();
  const ago = publishedAgo(article.publishedAt, now());
  const label = `${article.title}, ${article.feedTitle}, ${ago}${article.read ? ', Read' : ''}`;
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
          <AppText variant="label" className="shrink text-text-muted" numberOfLines={1}>
            {article.feedTitle}
          </AppText>
          <AppText variant="label" className="text-text-muted">
            {ago}
          </AppText>
        </View>
        <AppText variant="reading" className={article.read ? 'text-text-muted' : 'text-text'}>
          {article.title}
        </AppText>
        {article.subtitle ? (
          <AppText variant="label" className="text-text-muted" numberOfLines={2}>
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
 */
export function FeedsScreen({ feed }: { feed?: string }) {
  const insets = useSafeAreaInsets();
  const chipsView = useChips();
  const chips = chipsView.status === 'ready' ? chipsView.chips : [];
  const selectedChip = chips.find((chip) => chip.id === feed) ?? null;
  const all = useAll(selectedChip?.id ?? null);
  const { refreshing, refresh } = useRefresh();
  const { colorScheme } = useEnvironment();
  const theme = themes[colorScheme];
  const noFeeds = chipsView.status === 'ready' && chips.length === 0;
  const empty = all.status === 'ready' && all.articles.length === 0;

  const select = (feedId: string | null) => router.setParams({ feed: feedId ?? undefined });

  const header = (
    <View className="gap-group pb-related" style={{ paddingTop: insets.top + spacing.section }}>
      <View className="flex-row items-center justify-between px-edge">
        <AppText variant="title" className="text-text">
          Feeds
        </AppText>
        {chips.length > 0 ? (
          <Pressable role="button" aria-label="Manage Feeds" onPress={manageFeeds} hitSlop={spacing.related} className="p-inside">
            <SymbolView name={{ ios: 'slider.horizontal.3', android: 'tune' }} size={MANAGE_ICON} tintColor={theme.text} />
          </Pressable>
        ) : null}
      </View>
      {chips.length > 0 ? <ChipRow chips={chips} selected={selectedChip?.id ?? null} onSelect={select} onAdd={addFeed} /> : null}
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
    <LegendList
      testID="all-list"
      data={all.status === 'ready' ? all.articles : []}
      keyExtractor={(article) => article.id}
      renderItem={({ item }) => <Row article={item} />}
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
  );
}
