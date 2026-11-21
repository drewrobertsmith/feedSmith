import { router } from 'expo-router';
import { FlatList, Pressable, RefreshControl, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppButton } from '@/components/app-button';
import { AppText } from '@/components/app-text';
import { useAll, useRefresh, type ArticleRow } from '@/feeds/feeds-data';
import { publishedDate } from '@/feeds/format';
import { useEnvironment } from '@/environment';
import { spacing } from '@/theme/spacing';
import { themes } from '@/theme/tokens';

const addFeed = () => router.push('/add-feed');

function Row({ article }: { article: ArticleRow }) {
  const { colorScheme } = useEnvironment();
  const date = publishedDate(article.publishedAt);
  return (
    <Pressable
      role="link"
      aria-label={`${article.title}, ${article.feedTitle}, ${date}`}
      onPress={() => router.push(`/article/${article.id}`)}
      android_ripple={{ color: themes[colorScheme].surface }}
      className="gap-inside px-edge py-related"
    >
      <AppText variant="reading">{article.title}</AppText>
      <View className="flex-row flex-wrap gap-related">
        <AppText variant="label" className="text-text-muted">
          {article.feedTitle}
        </AppText>
        <AppText variant="label" className="text-text-muted">
          {date}
        </AppText>
      </View>
    </Pressable>
  );
}

/** The Feeds section: All, every Article newest first (Q1; titles only until FEE-27). */
export function FeedsScreen() {
  const insets = useSafeAreaInsets();
  const all = useAll();
  const { refreshing, refresh } = useRefresh();
  const { colorScheme } = useEnvironment();
  const theme = themes[colorScheme];
  const empty = all.status === 'ready' && all.articles.length === 0;

  const header = (
    <View className="flex-row items-center justify-between px-edge pb-group" style={{ paddingTop: insets.top + spacing.section }}>
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
        <View className="gap-group px-edge">
          <AppText variant="reading" className="text-text-muted">
            Add a Feed to see its Articles here.
          </AppText>
          <AppButton label="Add a Feed" onPress={addFeed} />
        </View>
      </View>
    );
  }

  return (
    <FlatList
      testID="all-list"
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
      data={all.status === 'ready' ? all.articles : []}
      keyExtractor={(article) => article.id}
      renderItem={({ item }) => <Row article={item} />}
      ListHeaderComponent={header}
      contentContainerStyle={{ gap: spacing.related, paddingBottom: insets.bottom + spacing.section }}
    />
  );
}
