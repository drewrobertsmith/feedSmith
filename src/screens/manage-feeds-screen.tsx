import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, TextInput, ToastAndroid, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/app-text';
import { DragRow } from '@/components/drag-row';
import { FeedIcon } from '@/components/feed-icon';
import { useEnvironment } from '@/environment';
import { useManage, useManageActions, useSetPinned, type ManagedFeed } from '@/feeds/feeds-data';
import { spacing } from '@/theme/spacing';
import { themes } from '@/theme/tokens';
import { typeScale } from '@/theme/type';

const ICON = 20;
const HANDLE = 24;

/** A small text action on a Feed's row, named for TalkBack with the Feed (Q15). */
function Action({ label, name, onPress }: { label: string; name: string; onPress: () => void }) {
  return (
    <Pressable role="button" aria-label={`${label} ${name}`} onPress={onPress} hitSlop={spacing.inside} className="py-inside">
      <AppText variant="label" className="text-text underline" accessible={false}>
        {label}
      </AppText>
    </Pressable>
  );
}

function RenameField({ feed, onDone }: { feed: ManagedFeed; onDone: () => void }) {
  const { colorScheme, fontScale } = useEnvironment();
  const { rename } = useManageActions();
  const [name, setName] = useState(feed.title);
  const [invalid, setInvalid] = useState(false);
  const save = async () => {
    const outcome = await rename(feed.id, name);
    if (outcome === 'invalid-name') setInvalid(true);
    else onDone();
  };
  return (
    <View className="gap-related">
      <TextInput
        aria-label={`New name for ${feed.title}`}
        value={name}
        onChangeText={setName}
        onSubmitEditing={save}
        autoFocus
        maxLength={100}
        returnKeyType="done"
        placeholderTextColor={themes[colorScheme].textMuted}
        className="rounded-lg border border-text-muted px-group py-related text-text"
        style={{ fontFamily: typeScale.reading.fontFamily, fontSize: typeScale.reading.fontSize * fontScale }}
      />
      {invalid ? (
        <AppText variant="label" role="alert" className="text-text">
          Give the Feed a name of up to 100 characters.
        </AppText>
      ) : null}
      <View className="flex-row gap-group">
        <Action label="Save" name="name" onPress={save} />
        <Action label="Cancel" name="renaming" onPress={onDone} />
      </View>
    </View>
  );
}

function FeedRow({ feed, accessibleName, moves }: { feed: ManagedFeed; accessibleName: string; moves?: ReorderActions }) {
  const setPinned = useSetPinned();
  const { remove } = useManageActions();
  const [renaming, setRenaming] = useState(false);

  const togglePin = async () => {
    const outcome = await setPinned(feed.id, !feed.pinned);
    if (outcome === 'pins-full') ToastAndroid.show('You can Pin up to 3 Feeds. Unpin one first.', ToastAndroid.SHORT);
  };
  const confirmRemove = () =>
    Alert.alert(`Remove ${feed.title}?`, 'Its Articles go too. Articles you’ve Saved stay in Saved.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => void remove(feed.id) },
    ]);

  return (
    <View
      accessible={!renaming}
      aria-label={accessibleName}
      accessibilityActions={moves?.actions}
      onAccessibilityAction={(event) => moves?.onAction(event.nativeEvent.actionName)}
      className="gap-related py-group"
    >
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
      {renaming ? (
        <RenameField feed={feed} onDone={() => setRenaming(false)} />
      ) : (
        <View className="flex-row flex-wrap gap-group">
          <Action label="Rename" name={feed.title} onPress={() => setRenaming(true)} />
          <Action label={feed.pinned ? 'Unpin' : 'Pin'} name={feed.title} onPress={() => void togglePin()} />
          <Action label="Remove" name={feed.title} onPress={confirmRemove} />
        </View>
      )}
    </View>
  );
}

type ReorderActions = { actions: { name: string; label: string }[]; onAction: (name: string) => void };

/** A Pinned Feed's TalkBack actions: move it up or down among the Pinned (Q15). */
function reorderActions(index: number, count: number, move: (to: number) => void): ReorderActions {
  const actions = [
    ...(index > 0 ? [{ name: 'moveUp', label: 'Move up' }] : []),
    ...(index < count - 1 ? [{ name: 'moveDown', label: 'Move down' }] : []),
  ];
  return { actions, onAction: (name) => move(name === 'moveUp' ? index - 1 : index + 1) };
}

/** Manage Feeds (D13): rename, remove, Pin and order Feeds, and see which have stopped working (P15). */
export function ManageFeedsScreen() {
  const insets = useSafeAreaInsets();
  const { colorScheme } = useEnvironment();
  const view = useManage();
  const { orderPins } = useManageActions();
  const feeds = view.status === 'ready' ? view.feeds : [];
  const pinned = feeds.filter((feed) => feed.pinned);
  const others = feeds.filter((feed) => !feed.pinned);

  const move = (from: number, to: number) => {
    const ids = pinned.map((feed) => feed.id);
    const [moved] = ids.splice(from, 1);
    ids.splice(to, 0, moved);
    void orderPins(ids);
  };

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerClassName="gap-section px-edge"
      contentContainerStyle={{ paddingTop: insets.top + spacing.section, paddingBottom: insets.bottom + spacing.section }}
      keyboardShouldPersistTaps="handled"
    >
      <AppText variant="title">Manage Feeds</AppText>
      {view.status === 'ready' && feeds.length === 0 ? (
        <AppText variant="reading" className="text-text-muted">
          No Feeds yet. Add one from the + on Feeds.
        </AppText>
      ) : null}
      {pinned.length > 0 ? (
        <View className="gap-related">
          <AppText variant="label" className="text-text-muted">
            Pinned
          </AppText>
          {pinned.map((feed, index) => (
            <DragRow
              key={feed.id}
              index={index}
              count={pinned.length}
              handleLabel={`Drag to reorder ${feed.title}`}
              onDrop={(to) => move(index, to)}
              handle={
                <View className="pr-related">
                  <SymbolView name={{ ios: 'line.3.horizontal', android: 'drag_indicator' }} size={HANDLE} tintColor={themes[colorScheme].textMuted} />
                </View>
              }
            >
              <FeedRow
                feed={feed}
                accessibleName={`${feed.title}, Pinned, ${index + 1} of ${pinned.length}`}
                moves={reorderActions(index, pinned.length, (to) => move(index, to))}
              />
            </DragRow>
          ))}
        </View>
      ) : null}
      {others.length > 0 ? (
        <View className="gap-related">
          {pinned.length > 0 ? (
            <AppText variant="label" className="text-text-muted">
              Feeds
            </AppText>
          ) : null}
          {others.map((feed) => (
            <FeedRow key={feed.id} feed={feed} accessibleName={feed.title} />
          ))}
        </View>
      ) : null}
    </ScrollView>
  );
}
