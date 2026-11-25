import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppButton } from '@/components/app-button';
import { AppText } from '@/components/app-text';
import { FeedIcon } from '@/components/feed-icon';
import { NativeSheet } from '@/components/native-sheet';
import { NativeTextField } from '@/components/native-text-field';
import { UndoToastHost, useUndo } from '@/components/undo-toast';
import { useEnvironment } from '@/environment';
import { useManage, useManageActions, type ManagedFeed } from '@/feeds/feeds-data';
import { spacing } from '@/theme/spacing';
import { themes } from '@/theme/tokens';
import { MAX_FEED_NAME } from '../../convex/lib/feedName';

const ICON = 20;

/** A small text action on a Feed's row; TalkBack hears its full name, e.g. "Rename The Verge" (Q15). */
function RowAction({
  label,
  accessibleName,
  onPress,
  tone = 'plain',
}: {
  label: string;
  accessibleName: string;
  onPress: () => void;
  /** `destructive`: brick words with no outline, quieter than the actions before it (D19, Q32). */
  tone?: 'plain' | 'destructive';
}) {
  const destructive = tone === 'destructive';
  return (
    // Outlined like a chip: plainly tappable, with room for a thumb. The destructive one keeps the
    // same box, so the row's actions line up, but draws no outline.
    <Pressable
      role="button"
      aria-label={accessibleName}
      onPress={onPress}
      hitSlop={spacing.inside}
      className={`rounded-full border px-group py-related ${destructive ? 'border-transparent' : 'border-text-muted'}`}
    >
      <AppText variant="label" className={destructive ? 'text-destructive' : 'text-text'} accessible={false}>
        {label}
      </AppText>
    </Pressable>
  );
}

/** The rename sheet's content: its title, the name field, any problem, then Cancel and Save. */
function RenameForm({ feed, onDone }: { feed: ManagedFeed; onDone: () => void }) {
  const { rename } = useManageActions();
  const [name, setName] = useState(feed.title);
  const [problem, setProblem] = useState<string | null>(null);
  const save = async () => {
    const outcome = await rename(feed.id, name);
    const problems: Record<typeof outcome, string | null> = {
      ok: null,
      'not-found': null,
      'invalid-name': `Give the Feed a name of up to ${MAX_FEED_NAME} characters.`,
      failed: "Couldn't save the name. Check your connection and try again.",
    };
    if (problems[outcome]) setProblem(problems[outcome]);
    else onDone();
  };
  return (
    <View testID="rename-sheet" className="gap-group px-edge pb-section">
      <AppText variant="title" className="text-text">
        {`Rename ${feed.title}`}
      </AppText>
      <View className="gap-related">
        <NativeTextField
          purpose="name"
          label={`New name for ${feed.title}`}
          defaultValue={feed.title}
          onChangeText={setName}
          onSubmitEditing={() => void save()}
          maxLength={MAX_FEED_NAME}
        />
        {problem ? (
          <AppText variant="label" role="alert" className="text-text">
            {problem}
          </AppText>
        ) : null}
      </View>
      {/* Android's order: the way out, then the one primary action at the end. */}
      <View className="flex-row flex-wrap items-center justify-end gap-related">
        <Pressable
          role="button"
          aria-label="Cancel renaming"
          onPress={onDone}
          hitSlop={spacing.inside}
          className="rounded-full px-group py-related"
        >
          <AppText variant="label" className="text-text" accessible={false}>
            Cancel
          </AppText>
        </Pressable>
        <AppButton label="Save" accessibleName="Save name" onPress={() => void save()} />
      </View>
    </View>
  );
}

function FeedRow({ feed, onRename }: { feed: ManagedFeed; onRename: () => void }) {
  const note = useUndo();
  const { colorScheme } = useEnvironment();
  const { remove } = useManageActions();

  const confirmRemove = () =>
    Alert.alert(`Remove ${feed.title}?`, 'Its Articles go too. Articles you’ve Saved stay in Saved.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => void removeFeed(),
      },
    ]);
  const removeFeed = async () => {
    // Nothing to undo: it didn't happen (Q5).
    if ((await remove(feed.id)) === 'failed') note(`Couldn't remove ${feed.title}. Try again.`);
  };

  return (
    // Not grouped into one TalkBack stop: its name, site and each action are reached on their own (Q15).
    <View className="gap-related py-group">
      <View className="flex-row items-center gap-related">
        <FeedIcon key={feed.faviconUrl ?? feed.title} url={feed.faviconUrl} title={feed.title} size={ICON} />
        <View className="flex-1 gap-inside">
          <AppText variant="reading" className="text-text">
            {feed.title}
          </AppText>
          <AppText variant="label" className="text-text-muted">
            {feed.host}
          </AppText>
        </View>
      </View>
      {!feed.working ? (
        <AppText variant="label" className="text-text-muted">
          Not working; feedSmith keeps trying.
        </AppText>
      ) : null}
      <View className="flex-row flex-wrap items-center gap-related">
        <RowAction label="Rename" accessibleName={`Rename ${feed.title}`} onPress={onRename} />
        {/* Remove comes last, behind a divider (Q32), and wraps with it at large text. */}
        <View className="flex-row items-center gap-related">
          <View
            className="self-stretch"
            style={{ width: StyleSheet.hairlineWidth, backgroundColor: themes[colorScheme].decor }}
          />
          <RowAction label="Remove" accessibleName={`Remove ${feed.title}`} onPress={confirmRemove} tone="destructive" />
        </View>
      </View>
    </View>
  );
}

/**
 * The Feed in the rename sheet. It stays after the sheet closes, so the sheet's words don't vanish
 * while it slides away. `openCount` numbers each opening: every rename starts from the Feed's name,
 * and only the opening still shown can be closed.
 */
type Renaming = { feed: ManagedFeed; open: boolean; openCount: number };

/**
 * Manage Feeds (D13): rename and remove Feeds, and see which have stopped working (P15). Pinning is gone (FEE-94).
 * `renaming`, a Feed's id, opens its rename sheet at once, for the state gallery.
 */
export function ManageFeedsScreen({ renaming: initiallyRenaming }: { renaming?: string }) {
  const insets = useSafeAreaInsets();
  const view = useManage();
  const feeds = view.status === 'ready' ? view.feeds : [];

  // `tapped` is null until the User taps Rename; till then the gallery's Feed, if any, is shown.
  const [tapped, setTapped] = useState<Renaming | null>(null);
  const galleryFeed = tapped === null ? feeds.find((feed) => feed.id === initiallyRenaming) : undefined;
  const renaming = tapped ?? (galleryFeed ? { feed: galleryFeed, open: true, openCount: 0 } : null);
  const startRenaming = (feed: ManagedFeed) =>
    setTapped({ feed, open: true, openCount: (renaming?.openCount ?? 0) + 1 });
  // A save that finishes after its sheet was closed and another opened doesn't close the new one.
  const stopRenaming = (openCount: number) =>
    setTapped((current) => {
      const shown = current ?? renaming;
      return shown?.openCount === openCount ? { ...shown, open: false } : current;
    });

  return (
    <View className="flex-1 bg-background">
      <ScrollView
        className="flex-1 bg-background"
        contentContainerClassName="gap-section px-edge"
        contentContainerStyle={{
          paddingTop: insets.top + spacing.section,
          paddingBottom: insets.bottom + spacing.section,
        }}
        keyboardShouldPersistTaps="handled"
      >
        <AppText variant="title">Manage Feeds</AppText>
        {view.status === 'ready' && feeds.length === 0 ? (
          <AppText variant="reading" className="text-text-muted">
            No Feeds yet. Add one from the + on Feeds.
          </AppText>
        ) : null}
        {feeds.length > 0 ? (
          <View className="gap-related">
            {feeds.map((feed) => (
              <FeedRow key={feed.id} feed={feed} onRename={() => startRenaming(feed)} />
            ))}
          </View>
        ) : null}
      </ScrollView>
      {/* Renaming is a quick task, so it's a sheet over the list, not a place of its own (Q32). */}
      {renaming ? (
        <NativeSheet open={renaming.open} onClose={() => stopRenaming(renaming.openCount)}>
          <RenameForm
            key={renaming.openCount}
            feed={renaming.feed}
            onDone={() => stopRenaming(renaming.openCount)}
          />
        </NativeSheet>
      ) : null}
      {/* A Remove that didn't reach the server says so here, above the gesture bar (Q5). */}
      <UndoToastHost bottom={insets.bottom} />
    </View>
  );
}
