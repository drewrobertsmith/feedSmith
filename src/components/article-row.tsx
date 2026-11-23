import { Image } from 'expo-image';
import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { Pressable, View, type AccessibilityActionEvent } from 'react-native';

import { AppText } from '@/components/app-text';
import { FeedIcon } from '@/components/feed-icon';
import { ROW_ACTIONS, rowAction, type RowActionName } from '@/components/row-action';
import { useEnvironment, useSizeScale } from '@/environment';
import type { ArticleRow as Row } from '@/feeds/feeds-data';
import { byline, publishedAgo } from '@/feeds/format';
import { themes } from '@/theme/tokens';

/** A Read row's image fades back with its text (P7); text dims by colour, so contrast holds (Q14). */
const READ_IMAGE_OPACITY = 0.55;
const THUMBNAIL = 72;
const FAVICON = 16;
const SAVED_MARK = 16;


/**
 * One Article in a list (P12): Feeds and Saved share it. Its parts each have one voice (Q29):
 * muted sans meta, the title in Literata, a full-strength sans byline, the Subtitle in small muted
 * Literata. `feedNamed` off leaves the Feed's name out where a chip already names it (P20).
 * `savedMark` shows a Saved Article's Gold mark (D5), where not every row is Saved. Its action,
 * Save or Done, is offered to TalkBack as well as by the swipe (Q15).
 */
export function ArticleRow({
  article,
  feedNamed,
  savedMark,
  onAction,
}: {
  article: Row;
  feedNamed: boolean;
  savedMark: boolean;
  onAction: (action: RowActionName) => void;
}) {
  const { colorScheme, fontScale, now } = useEnvironment();
  const scale = useSizeScale();
  const theme = themes[colorScheme];
  const ago = publishedAgo(article.publishedAt, now());
  const credit = byline(article.authors);
  const showMark = savedMark && article.saved;
  const label = [
    article.title,
    credit,
    feedNamed ? article.feedTitle : undefined,
    ago,
    showMark ? 'Saved' : undefined,
    article.read ? 'Read' : undefined,
  ]
    .filter(Boolean)
    .join(', ');
  const thumbnail = THUMBNAIL * fontScale;
  const action = rowAction(article);

  return (
    <Pressable
      role="link"
      aria-label={label}
      accessibilityActions={[{ name: action, label: ROW_ACTIONS[action].label }]}
      onAccessibilityAction={(event: AccessibilityActionEvent) => {
        if (event.nativeEvent.actionName === action) onAction(action);
      }}
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
          {/* Yours (D5): Gold, the one accent, and a bookmark with a tick, so it reads without colour too (Q14). */}
          {showMark ? (
            <SymbolView
              testID="row-saved-mark"
              name={{ ios: 'bookmark.fill', android: 'bookmark_added' }}
              size={SAVED_MARK * scale}
              tintColor={theme.accent}
              accessible={false}
            />
          ) : null}
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
