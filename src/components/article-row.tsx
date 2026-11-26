import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useEffect, useRef, type ComponentRef, type Ref } from 'react';
import { Pressable, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { FeedIcon } from '@/components/feed-icon';
import { useEnvironment } from '@/environment';
import type { ArticleRow as Row } from '@/feeds/feeds-data';
import { byline, publishedAgo } from '@/feeds/format';
import { recordOrigin, registerRow } from '@/navigation/article-origin';
import type { Rect } from '@/navigation/container-transform';
import { themes } from '@/theme/tokens';

/** A Read row's image fades back with its text (P7); text dims by colour, so contrast holds (Q14). */
export const READ_IMAGE_OPACITY = 0.55;
const THUMBNAIL = 72;
const FAVICON = 16;

export type ViewRef = ComponentRef<typeof View>;

/** Where a view is drawn now, in window coordinates; undefined where it can't be measured (Jest has no layout). */
export function rectOf(view: ViewRef | null): Rect | undefined {
  const box = view?.getBoundingClientRect?.();
  return box && box.width > 0 && box.height > 0
    ? { x: box.x, y: box.y, width: box.width, height: box.height }
    : undefined;
}

/**
 * What a row shows (P12). Its parts each have one voice (Q29): muted sans meta, the title in Literata, a
 * full-strength sans byline, the Subtitle in small muted Literata. `feedNamed` off leaves the Feed's name out
 * where a chip already names it (P20). Opening an Article draws a copy of it to grow from (FEE-114), with
 * `image` "space" while its thumbnail travels on its own, so its words wrap exactly as the row's did.
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
  const thumbnail = THUMBNAIL * fontScale;
  return (
    <>
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
        <View
          ref={thumbRef}
          // Only the space, while the thumbnail travels on its own: nothing to see where it was.
          className={image === 'show' ? 'overflow-hidden rounded-lg bg-surface' : undefined}
          style={{ width: thumbnail, height: thumbnail }}
        >
          {image === 'show' ? (
            <Image
              testID="row-image"
              source={{ uri: article.imageUrl }}
              accessible={false}
              contentFit="cover"
              recyclingKey={article.id}
              style={{
                width: thumbnail,
                height: thumbnail,
                opacity: article.read ? READ_IMAGE_OPACITY : 1,
              }}
            />
          ) : null}
        </View>
      ) : null}
    </>
  );
}

/** The row's own layout, shared by the row and the copy the Reading view grows from (FEE-114). */
export const ROW_CLASS = 'flex-row gap-group bg-background px-edge py-group';

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
