import { LegendList } from '@legendapp/list/react-native';
import { router } from 'expo-router';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppButton } from '@/components/app-button';
import { AppText } from '@/components/app-text';
import { ArticleRow } from '@/components/article-row';
import { rowAction } from '@/components/row-action';
import { SwipeRow } from '@/components/swipe-row';
import { TopBar } from '@/components/top-bar';
import { UndoToastHost } from '@/components/undo-toast';
import { useSaved } from '@/feeds/feeds-data';
import { useSaveAndDone } from '@/feeds/use-save-and-done';
import { AccountButton } from '@/screens/account/account-sheet';
import { spacing } from '@/theme/spacing';

/** A row's usual height, for the list's first layout before rows measure themselves. */
const ESTIMATED_ROW = 112;

const goToFeeds = () => router.navigate('/');

/**
 * Saved (P2, P8): what you mean to read, most recently Saved first (P14), in the same rows as
 * Feeds, under the same top bar (Q31). Done takes an Article out, by swipe, TalkBack or its
 * Reading view, with Undo (Q35). Empty, it says how to Save and leads to Feeds (Q34).
 * `accountOpen` opens the Account sheet at once, for the state gallery.
 */
export function SavedScreen({ accountOpen }: { accountOpen?: boolean }) {
  const insets = useSafeAreaInsets();
  const saved = useSaved();
  const saveOrDone = useSaveAndDone();
  const empty = saved.status === 'ready' && saved.articles.length === 0;

  const header = (
    <View className="gap-group pb-related" style={{ paddingTop: insets.top + spacing.section }}>
      <TopBar title="Saved" trailing={<AccountButton initiallyOpen={accountOpen} />} />
      {empty ? (
        <View className="gap-group px-edge pt-related">
          <AppText variant="reading" className="text-text">
            Nothing Saved yet.
          </AppText>
          <AppText variant="reading" className="text-text-muted">
            Swipe an Article left in Feeds, or tap Save as you read, and it waits here until you mark it Done.
          </AppText>
          <AppButton label="Go to Feeds" onPress={goToFeeds} />
        </View>
      ) : null}
    </View>
  );

  return (
    <View className="flex-1 bg-background">
      <LegendList
        testID="saved-list"
        data={saved.status === 'ready' ? saved.articles : []}
        keyExtractor={(article) => article.id}
        renderItem={({ item }) => (
          // Done takes it out of Saved, so it slides away first.
          <SwipeRow id={item.id} action={rowAction(item)} leaves onCommit={() => saveOrDone(item.id, rowAction(item), { haptic: false })}>
            <ArticleRow article={item} feedNamed savedMark={false} onAction={(action) => saveOrDone(item.id, action)} />
          </SwipeRow>
        )}
        estimatedItemSize={ESTIMATED_ROW}
        // Rows hold small state (a favicon that failed): a reused row must start fresh.
        recycleItems={false}
        ListHeaderComponent={header}
        className="flex-1 bg-background"
        contentContainerStyle={{ paddingBottom: insets.bottom + spacing.section }}
      />
      <UndoToastHost />
    </View>
  );
}
