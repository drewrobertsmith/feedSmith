import { router } from 'expo-router';
import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { Pressable, ScrollView, View, type NativeScrollEvent, type NativeSyntheticEvent, type ScrollViewInstance } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppButton } from '@/components/app-button';
import { AppText } from '@/components/app-text';
import { useSizeScale } from '@/environment';
import { useArticle, useMarkRead, useOffline, type ArticleView, type Block, type ReadingArticle } from '@/feeds/feeds-data';
import { byline, publishedDate } from '@/feeds/format';
import { openLink } from '@/feeds/open-link';
import { usePlaceKeeper } from '@/navigation/place-context';
import { ArticleBlocks } from '@/screens/reading/article-blocks';
import { useLeaveArticle } from '@/screens/reading/article-leave-context';
import { ArticleTransition } from '@/screens/reading/article-transition';
import { spacing } from '@/theme/spacing';

/** When the link names no Article of this User's, or one that's gone. */
export function ArticleMissing() {
  const insets = useSafeAreaInsets();
  const leave = useLeaveArticle();
  return (
    <View className="flex-1 gap-group bg-background px-edge" style={{ paddingTop: insets.top + spacing.section }}>
      <AppText variant="title">This Article isn’t available.</AppText>
      <AppText variant="reading" className="text-text-muted">
        It may have been removed from its Feed.
      </AppText>
      <AppButton
        label="Back to All"
        // The page closes the way Back closes it, then goes (FEE-115).
        onPress={() => leave(() => (router.canGoBack() ? router.back() : router.replace('/')))}
      />
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
      <ArticleBlocks blocks={blocks} lead={!!imageUrl} />
      <AppText variant="label" className="text-text-muted">
        This Article couldn’t be brought in from its page.
      </AppText>
      {link ? <AppButton label="Open original" onPress={() => openLink(link)} /> : null}
    </View>
  );
}

/** About 34em of reading text: the column stops widening on wide screens (D6). */
const MEASURE = 680;
const textOf = (block: Block | undefined) =>
  block?.type === 'paragraph'
    ? block.spans
        .map((span) => span.text)
        .join('')
        .trim()
    : undefined;

/**
 * The Article's headline, Subtitle and meta: the deck is left out where the text already says it. While the
 * Article loads, only the headline shows, with the title its row had (FEE-48), so the page fades in with it.
 */
function ArticleHeader({ title, article }: { title: string; article?: ReadingArticle }) {
  return (
    <View className="gap-related">
      <AppText variant="headline">{title}</AppText>
      {article ? <ArticleMeta article={article} /> : null}
    </View>
  );
}

/** Beneath the headline: the deck, the credit, then the Feed and date. */
function ArticleMeta({ article }: { article: ReadingArticle }) {
  const leave = useLeaveArticle();
  const { subtitle, authors, feedId, feedTitle, publishedAt, page, blocks } = article;
  const credit = byline(authors);
  // A summary-only Article's text is its Subtitle; a Feed's text often opens with it too.
  const deck = subtitle && !page && textOf(blocks[0]) !== subtitle.trim() ? subtitle : undefined;
  return (
    <>
      {deck ? (
        <AppText variant="deck" className="text-text-muted">
          {deck}
        </AppText>
      ) : null}
      {/* The credit, at full strength; the Feed and date sit quieter beneath it (FEE-41). */}
      {credit ? (
        <AppText variant="label" className="text-text">
          {credit}
        </AppText>
      ) : null}
      <View className="flex-row items-baseline gap-related pt-inside">
        {/* A breadcrumb to the Feed (FEE-47): back to Feeds with its chip chosen. A removed Feed's name stays, unlinked (T23). */}
        {feedId ? (
          <Pressable
            role="link"
            aria-label={`${feedTitle}, open its Articles`}
            // The page closes first, then Feeds shows the Feed chosen, so the two never move at once (FEE-115).
            onPress={() => leave(() => router.dismissTo({ pathname: '/', params: { feed: feedId } }))}
            hitSlop={spacing.related}
            className="shrink flex-row items-baseline gap-inside"
          >
            <AppText variant="label" className="shrink text-text-muted" numberOfLines={1} accessible={false}>
              {feedTitle}
            </AppText>
            <AppText variant="label" className="text-text-muted" accessible={false}>
              ›
            </AppText>
          </Pressable>
        ) : (
          <AppText variant="label" className="shrink text-text-muted" numberOfLines={1}>
            {feedTitle}
          </AppText>
        )}
        <AppText variant="label" className="text-text-muted">
          {publishedDate(publishedAt)}
        </AppText>
      </View>
    </>
  );
}

/** Where an Article ends: a short rule and the way to the original. */
function ArticleEnd({ link }: { link: string }) {
  return (
    <View testID="article-end" className="items-start gap-group">
      <View className="h-px w-12 bg-decor" />
      <AppButton label="Open original" onPress={() => openLink(link)} />
    </View>
  );
}

/** The lead image, unless the text opens with an image of its own (often the same one, resized). */
const leadOf = (article: ReadingArticle) =>
  article.page !== 'unavailable' && article.imageUrl && article.blocks[0]?.type !== 'image'
    ? article.imageUrl
    : undefined;

/**
 * Whether the page's first picture comes right after its header, for a row's thumbnail to land on (FEE-114):
 * the lead image, the text's own opening image, or the image of a page that couldn't be read.
 */
const opensWithImage = (article: ReadingArticle) =>
  article.page === 'unavailable' ? !!article.imageUrl : !!leadOf(article) || article.blocks[0]?.type === 'image';

/** Below the header: the fallback for a page that couldn't be read, or the lead image, the text and its end. */
function ArticleBody({ article }: { article: ReadingArticle }) {
  if (article.page === 'unavailable') return <PageUnavailable article={article} />;
  const lead = leadOf(article);
  return (
    <>
      {lead ? (
        <View testID="lead-image">
          <ArticleBlocks blocks={[{ type: 'image', src: lead }]} lead />
        </View>
      ) : null}
      <View className="gap-group">
        {article.page === 'extracting' ? (
          // Announced when it goes: the full text replaces the Subtitle as soon as it's read.
          <AppText variant="label" className="text-text-muted" accessibilityLiveRegion="polite">
            Bringing in the full Article from its page…
          </AppText>
        ) : null}
        <ArticleBlocks blocks={article.blocks} link={article.link} lead={!lead} />
      </View>
      {article.link ? <ArticleEnd link={article.link} /> : null}
    </>
  );
}

/**
 * The Reading view (P13, D6, D7): headline, Subtitle, Feed and date, the lead image, then the
 * text, and a plain end. Literata for everything the author wrote, Instrument Sans for what
 * the app says. The page itself never moves.
 */
/**
 * Your place in an Article (FEE-130, Q4): it's part of where you are while it's open, and the one you were reading
 * when Android closed the app opens again where you left it. Its text arrives after the page opens, so the place
 * is scrolled to once the page is tall enough; until then it starts there. One that's gone falls back to Feeds.
 */
function useArticlePlace(id: string, status: ArticleView['status']) {
  const keeper = usePlaceKeeper();
  const [startAt] = useState(() => keeper.restoredArticleOffset(id));
  const scroller = useRef<ScrollViewInstance>(null);
  const pending = useRef(startAt);
  useEffect(() => {
    keeper.update({ article: id, articleOffset: startAt });
    return () => keeper.update({ article: undefined, articleOffset: 0 });
  }, [keeper, id, startAt]);
  useEffect(() => {
    if (status === 'missing' && keeper.isRestoredArticle(id)) router.back();
    if (status !== 'loading') keeper.articleShown();
  }, [keeper, id, status]);
  return {
    startAt,
    scroller,
    // Kept in memory only; written when the app leaves the screen (Q21).
    onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => keeper.update({ articleOffset: event.nativeEvent.contentOffset.y }),
    onContentSizeChange: (_width: number, height: number) => {
      if (pending.current > 0 && height > pending.current) {
        scroller.current?.scrollTo({ y: pending.current, animated: false });
        pending.current = 0;
      }
    },
  };
}

export function ReadingScreen({ id }: { id: string }) {
  const insets = useSafeAreaInsets();
  const scale = useSizeScale();
  const view = useArticle(id);
  const markRead = useMarkRead();
  const offline = useOffline();
  const ready = view.status === 'ready';
  // Opening an Article marks it Read (P7): once per Article shown, not on every render.
  const markOpened = useEffectEvent(() => markRead(id));
  useEffect(() => {
    if (ready) markOpened();
  }, [ready, id]);
  const { startAt, onScroll, onContentSizeChange, scroller } = useArticlePlace(id, view.status);

  if (view.status === 'missing') {
    // Settled at once: there's nothing more to wait for, and it opens and leaves like any page (FEE-115).
    return (
      <ArticleTransition id={id} articleReady hasLead={false}>
        <ArticleMissing />
      </ArticleTransition>
    );
  }
  // While it loads, the title its row had (FEE-48); opened from a link, nothing until the Article arrives.
  const article = view.status === 'ready' ? view.article : undefined;
  const title = article?.title ?? (view.status === 'loading' ? view.title : undefined);
  return (
    // Opened from a row, the page grows from it and goes back into it (FEE-114).
    <ArticleTransition id={id} articleReady={ready} hasLead={!!article && opensWithImage(article)}>
      {title === undefined && !offline ? (
        <View className="flex-1 bg-background" />
      ) : (
        <View className="flex-1 bg-background">
        <ScrollView
          ref={scroller}
          testID="reading-scroll"
          contentOffset={{ x: 0, y: startAt }}
          onScroll={onScroll}
          scrollEventThrottle={100}
          onContentSizeChange={onContentSizeChange}
          className="flex-1"
          contentContainerClassName="items-center px-edge"
          contentContainerStyle={{
            paddingTop: insets.top + spacing.section,
            paddingBottom: insets.bottom + spacing.section,
          }}
        >
          <View className="w-full gap-section" style={{ maxWidth: MEASURE * scale }}>
            {title !== undefined ? <ArticleHeader title={title} article={article} /> : null}
            {article ? <ArticleBody article={article} /> : null}
            {/* Offline before the text arrived: a calm line, never a blank page or an endless wait (FEE-32, Q5). */}
            {!article && offline ? (
              <AppText variant="reading" className="text-text-muted">
                You’re offline. This Article will load when you’re back online.
              </AppText>
            ) : null}
          </View>
        </ScrollView>
        {/* Edge-to-edge (Q18): the text scrolls behind the status bar, and this still strip keeps its icons legible. */}
        <View
          testID="status-bar-backing"
          pointerEvents="none"
          className="absolute left-0 right-0 top-0 bg-background"
          style={{ height: insets.top }}
        />
        </View>
      )}
    </ArticleTransition>
  );
}
