import { LegendList } from '@legendapp/list/react-native';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, RefreshControl, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppButton } from '@/components/app-button';
import { AppText } from '@/components/app-text';
import { useEnvironment } from '@/environment';
import { useAll, useRefresh, type ArticleRow } from '@/feeds/feeds-data';
import { publishedAgo } from '@/feeds/format';
import { spacing } from '@/theme/spacing';
import { themes } from '@/theme/tokens';

const addFeed = () => router.push('/add-feed');

/** A Read row's image fades back with its text (P7); text dims by colour, so contrast holds (Q14). */
const READ_IMAGE_OPACITY = 0.55;
const THUMBNAIL = 72;
const FAVICON = 16;
/** A row's usual height, for the list's first layout before rows measure themselves. */
const ESTIMATED_ROW = 112;

/** The Feed's favicon, or its initial when it has none or it won't load. */
function FeedMark({ title, faviconUrl }: { title: string; faviconUrl?: string }) {
  const { fontScale } = useEnvironment();
  const [failed, setFailed] = useState(false);
  const size = FAVICON * fontScale;
  if (faviconUrl && !failed) {
    return (
      // The View clips the corners: expo-image doesn't take Uniwind's rounding classes.
      <View className="overflow-hidden rounded-sm" style={{ width: size, height: size }}>
        <Image
          testID="row-favicon"
          source={{ uri: faviconUrl }}
          recyclingKey={faviconUrl}
          onError={() => setFailed(true)}
          accessible={false}
          style={{ width: size, height: size }}
        />
      </View>
    );
  }
  return (
    <View className="items-center justify-center rounded-sm bg-surface" style={{ width: size, height: size }}>
      <AppText variant="label" className="text-text-muted" accessible={false}>
        {title.charAt(0).toUpperCase()}
      </AppText>
    </View>
  );
}

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
          <FeedMark key={article.faviconUrl ?? article.feedTitle} title={article.feedTitle} faviconUrl={article.faviconUrl} />
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

/** The Feeds section: All, every Article newest first (Q1, P12). Read is dimmed, never counted (P7). */
export function FeedsScreen() {
  const insets = useSafeAreaInsets();
  const all = useAll();
  const { refreshing, refresh } = useRefresh();
  const { colorScheme } = useEnvironment();
  const theme = themes[colorScheme];
  const empty = all.status === 'ready' && all.articles.length === 0;

  const header = (
    <View className="flex-row items-center justify-between px-edge pb-related" style={{ paddingTop: insets.top + spacing.section }}>
      <AppText variant="title">Feeds</AppText>
      {/* Temporary: the "+" chip replaces this in the chips ticket. Hidden when the empty state offers it. */}
      {all.status === 'ready' && !empty ? (
        <Pressable role="button" aria-label="Add a Feed" onPress={addFeed} hitSlop={spacing.related} className="px-related py-inside">
          <AppText variant="title" className="text-text" accessible={false}>
            +
          </AppText>
        </Pressable>
      ) : null}
    </View>
  );

  if (empty) {
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
