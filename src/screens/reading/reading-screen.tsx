import { router } from 'expo-router';
import { useEffect, useEffectEvent } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppButton } from '@/components/app-button';
import { AppText } from '@/components/app-text';
import { useArticle, useMarkRead, type Block, type ReadingArticle } from '@/feeds/feeds-data';
import { publishedDate } from '@/feeds/format';
import { openLink } from '@/feeds/open-link';
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

/**
 * A summary-only Article whose page couldn't be read (Q6): its lead image and Subtitle, and a
 * plain way to the original, instead of a broken page.
 */
function PageUnavailable({ article }: { article: ReadingArticle }) {
  const { imageUrl, subtitle, link } = article;
  const blocks: Block[] = [
    ...(imageUrl ? [{ type: 'image' as const, src: imageUrl }] : []),
    ...(subtitle ? [{ type: 'paragraph' as const, spans: [{ text: subtitle }] }] : []),
  ];
  return (
    <View className="gap-group">
      <ArticleBlocks blocks={blocks} />
      <AppText variant="label" className="text-text-muted">
        This Article couldn’t be brought in from its page.
      </AppText>
      {link ? <AppButton label="Open original" onPress={() => openLink(link)} /> : null}
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
      {article.page === 'unavailable' ? (
        <PageUnavailable article={article} />
      ) : (
        <View className="gap-group">
          {article.page === 'extracting' ? (
            // Announced when it goes: the full text replaces the Subtitle as soon as it's read.
            <AppText variant="label" className="text-text-muted" accessibilityLiveRegion="polite">
              Bringing in the full Article from its page…
            </AppText>
          ) : null}
          <ArticleBlocks blocks={article.blocks} link={article.link} />
        </View>
      )}
    </ScrollView>
  );
}
