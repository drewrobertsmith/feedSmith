import { Image } from 'expo-image';
import { router } from 'expo-router';
import { Pressable, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { SharedTitle } from '@/components/shared-title';
import { FeedIcon } from '@/components/feed-icon';
import { useEnvironment } from '@/environment';
import type { ArticleRow as Row } from '@/feeds/feeds-data';
import { byline, publishedAgo } from '@/feeds/format';
import { themes } from '@/theme/tokens';

/** A Read row's image fades back with its text (P7); text dims by colour, so contrast holds (Q14). */
const READ_IMAGE_OPACITY = 0.55;
const THUMBNAIL = 72;
const FAVICON = 16;


/**
 * One Article in a list (P12). Its parts each have one voice (Q29): muted sans meta, the title in
 * Literata, a full-strength sans byline, the Subtitle in small muted Literata. `feedNamed` off leaves
 * the Feed's name out where a chip already names it (P20). Opening it is its one action: Save and
 * Done are gone (FEE-95).
 */
export function ArticleRow({ article, feedNamed }: { article: Row; feedNamed: boolean }) {
  const { colorScheme, fontScale, now } = useEnvironment();
  const theme = themes[colorScheme];
  const ago = publishedAgo(article.publishedAt, now());
  const credit = byline(article.authors);
  const label = [
    article.title,
    credit,
    feedNamed ? article.feedTitle : undefined,
    ago,
    article.read ? 'Read' : undefined,
  ]
    .filter(Boolean)
    .join(', ');
  const thumbnail = THUMBNAIL * fontScale;

  return (
    <Pressable
      role="link"
      aria-label={label}
      onPress={() => router.push(`/article/${article.id}`)}
      android_ripple={{ color: theme.surface }}
      className="flex-row gap-group bg-background px-edge py-group"
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
        {/* Its own view, so opening the Article can carry it into the headline (FEE-48). */}
        <SharedTitle articleId={article.id}>
          <AppText variant="reading" className={article.read ? 'text-text-muted' : 'text-text'}>
            {article.title}
          </AppText>
        </SharedTitle>
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
