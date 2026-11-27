import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useEffect, useRef, type Ref } from 'react';
import { Pressable, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { FeedIcon } from '@/components/feed-icon';
import { useEnvironment } from '@/environment';
import { usePrefetchArticle, type ArticleRow as Row } from '@/feeds/feeds-data';
import { byline, publishedAgo } from '@/feeds/format';
import { recordOrigin, registerRow } from '@/navigation/article-origin';
import { rectOf, type ViewRef } from '@/navigation/measure';
import { READ_IMAGE_OPACITY, ROW_CLASS } from '@/components/article-row-style';
import { themes } from '@/theme/tokens';

/**
 * The lead image's side (FEE-132): a fixed square beside the title. It grows with the font size only so far, since
 * the words are what large text is for (Q16): at the largest size a square that grew as much left the title two words
 * a line.
 */
const IMAGE = 96;
const IMAGE_MAX = 120;
/** A title's lines at the usual size (FEE-132). */
const TITLE_LINES = 3;
const FAVICON = 16;
/** How far the title's first line sits below its line box's top, at the reading size. */
const TITLE_LEAD = 4;

/**
 * What a row shows (P12, FEE-132): the meta line across the top; under it, the title (three lines at most) and the
 * byline beside the lead image, a square level with the title's first line. Each part has one voice (Q29): muted
 * sans meta, the title in Literata, a full-strength sans byline. The Subtitle is the Reading view's, not the row's.
 * `feedNamed` off leaves the Feed's name out where a chip already names it (P20). Opening an Article draws a copy
 * of it to grow from (FEE-114), with `image` "space" while its image travels on its own, so its words wrap exactly
 * as the row's did.
 */
export function ArticleRowContent({
  article,
  feedNamed,
  image = 'show',
  thumbRef,
}: {
  article: Row;
  feedNamed: boolean;
  image?: 'show' | 'space';
  thumbRef?: Ref<ViewRef>;
}) {
  const { fontScale, now } = useEnvironment();
  const ago = publishedAgo(article.publishedAt, now());
  const credit = byline(article.authors);
  const side = Math.min(IMAGE * fontScale, IMAGE_MAX);
  return (
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
      <View className="flex-row items-start gap-group">
        <View className="flex-1 gap-inside">
          {/* Three lines at most, more as the text grows, so large text never cuts a headline short (Q16). */}
          <AppText variant="reading" numberOfLines={Math.round(TITLE_LINES * fontScale)} className={article.read ? 'text-text-muted' : 'text-text'}>
            {article.title}
          </AppText>
          {/* Who wrote it, where you decide whether to open it (FEE-41). */}
          {credit ? (
            <AppText variant="label" className={article.read ? 'text-text-muted' : 'text-text'} numberOfLines={1}>
              {credit}
            </AppText>
          ) : null}
        </View>
        {article.imageUrl ? (
          <View
            ref={thumbRef}
            // Only the space, while the image travels on its own: nothing to see where it was.
            className={image === 'show' ? 'overflow-hidden rounded-lg bg-surface' : undefined}
            // Its top level with the title's first line, not the line box above it.
            style={{ width: side, height: side, marginTop: TITLE_LEAD * fontScale }}
          >
            {image === 'show' ? (
              <Image
                testID="row-image"
                source={{ uri: article.imageUrl }}
                accessible={false}
                contentFit="cover"
                recyclingKey={article.id}
                style={{ width: side, height: side, opacity: article.read ? READ_IMAGE_OPACITY : 1 }}
              />
            ) : null}
          </View>
        ) : null}
      </View>
    </View>
  );
}

/**
 * One Article in a list (P12). Opening it is its one action: Save and Done are gone (FEE-95). Tapped, it
 * notes where it is for the Reading view to grow from, and stays findable while mounted so going back can
 * shrink into it (FEE-114).
 */
export function ArticleRow({ article, feedNamed }: { article: Row; feedNamed: boolean }) {
  const { colorScheme, reduceMotion, now } = useEnvironment();
  const theme = themes[colorScheme];
  const rowRef = useRef<ViewRef>(null);
  const thumbRef = useRef<ViewRef>(null);
  const prefetch = usePrefetchArticle();
  useEffect(
    () =>
      registerRow(article.id, () => {
        const row = rectOf(rowRef.current);
        return row ? { row, thumb: rectOf(thumbRef.current) } : undefined;
      }),
    [article.id],
  );
  const label = [
    article.title,
    byline(article.authors),
    feedNamed ? article.feedTitle : undefined,
    publishedAgo(article.publishedAt, now()),
    article.read ? 'Read' : undefined,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <Pressable
      ref={rowRef}
      role="link"
      aria-label={label}
      // Touching the row starts loading its Article, a moment before the tap lands (FEE-114).
      onPressIn={() => prefetch(article.id)}
      onPress={() => {
        // With Remove animations on, the Reading view just appears (Q17): nothing to grow from.
        if (!reduceMotion) recordOrigin(article, feedNamed);
        router.push(`/article/${article.id}`);
      }}
      android_ripple={{ color: theme.surface }}
      className={ROW_CLASS}
    >
      <ArticleRowContent article={article} feedNamed={feedNamed} thumbRef={thumbRef} />
    </Pressable>
  );
}
