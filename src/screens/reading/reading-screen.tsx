import { router } from 'expo-router';
import { useEffect, useEffectEvent } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppButton } from '@/components/app-button';
import { AppText } from '@/components/app-text';
import { useArticle, useMarkRead } from '@/feeds/feeds-data';
import { publishedDate } from '@/feeds/format';
import { ArticleBlocks } from '@/screens/reading/article-blocks';
import { spacing } from '@/theme/spacing';

/** When the link names no Article of this User's, or one that's gone. */
export function ArticleMissing() {
  const insets = useSafeAreaInsets();
  return (
    <View className="flex-1 gap-group bg-background px-edge" style={{ paddingTop: insets.top + spacing.section }}>
      <AppText variant="title">This Article isn’t available.</AppText>
      <AppText variant="reading" className="text-text-muted">
        It may have been removed from its Feed.
      </AppText>
      <AppButton label="Back to All" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
    </View>
  );
}

/** The Reading view: one Article's title, Feed, date and text (P13; polish comes in FEE-28). */
export function ReadingScreen({ id }: { id: string }) {
  const insets = useSafeAreaInsets();
  const view = useArticle(id);
  const markRead = useMarkRead();
  const ready = view.status === 'ready';
  // Opening an Article marks it Read (P7): once per Article shown, not on every render.
  const markOpened = useEffectEvent(() => markRead(id));
  useEffect(() => {
    if (ready) markOpened();
  }, [ready, id]);

  if (view.status === 'missing') return <ArticleMissing />;
  if (view.status === 'loading') return <View className="flex-1 bg-background" />;
  const { article } = view;

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerClassName="gap-section px-edge"
      contentContainerStyle={{ paddingTop: insets.top + spacing.section, paddingBottom: insets.bottom + spacing.section }}
    >
      <View className="gap-related">
        <AppText variant="title">{article.title}</AppText>
        <View className="flex-row flex-wrap gap-related">
          <AppText variant="label" className="text-text-muted">
            {article.feedTitle}
          </AppText>
          <AppText variant="label" className="text-text-muted">
            {publishedDate(article.publishedAt)}
          </AppText>
        </View>
      </View>
      <ArticleBlocks blocks={article.blocks} link={article.link} />
    </ScrollView>
  );
}
