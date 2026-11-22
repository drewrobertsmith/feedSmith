import { SymbolView } from "expo-symbols";
import { useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  TextInput,
  ToastAndroid,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppText } from "@/components/app-text";
import { DragList, DragRow } from "@/components/drag-row";
import { FeedIcon } from "@/components/feed-icon";
import { useEnvironment } from "@/environment";
import {
  useManage,
  useManageActions,
  useSetPinned,
  type ManagedFeed,
} from "@/feeds/feeds-data";
import { spacing } from "@/theme/spacing";
import { themes } from "@/theme/tokens";
import { typeScale } from "@/theme/type";
import { MAX_FEED_NAME } from "../../convex/lib/feedName";

const ICON = 20;
const HANDLE = 24;

/** A small text action on a Feed's row; TalkBack hears its full name, e.g. "Rename The Verge" (Q15). */
function RowAction({
  label,
  accessibleName,
  onPress,
}: {
  label: string;
  accessibleName: string;
  onPress: () => void;
}) {
  return (
    // Outlined like a chip: plainly tappable, with room for a thumb.
    <Pressable
      role="button"
      aria-label={accessibleName}
      onPress={onPress}
      hitSlop={spacing.inside}
      className="rounded-full border border-text-muted px-group py-related"
    >
      <AppText variant="label" className="text-text" accessible={false}>
        {label}
      </AppText>
    </Pressable>
  );
}

function RenameField({
  feed,
  onDone,
}: {
  feed: ManagedFeed;
  onDone: () => void;
}) {
  const { colorScheme, fontScale } = useEnvironment();
  const { rename } = useManageActions();
  const [name, setName] = useState(feed.title);
  const [problem, setProblem] = useState<string | null>(null);
  const save = async () => {
    const outcome = await rename(feed.id, name);
    const problems: Record<typeof outcome, string | null> = {
      ok: null,
      "not-found": null,
      "invalid-name": `Give the Feed a name of up to ${MAX_FEED_NAME} characters.`,
      failed: "Couldn't save the name. Check your connection and try again.",
    };
    if (problems[outcome]) setProblem(problems[outcome]);
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
        maxLength={MAX_FEED_NAME}
        returnKeyType="done"
        placeholderTextColor={themes[colorScheme].textMuted}
        className="rounded-lg border border-text-muted px-group py-related text-text"
        style={{
          fontFamily: typeScale.reading.fontFamily,
          fontSize: typeScale.reading.fontSize * fontScale,
        }}
      />
      {problem ? (
        <AppText variant="label" role="alert" className="text-text">
          {problem}
        </AppText>
      ) : null}
      <View className="flex-row gap-related">
        <RowAction label="Save" accessibleName="Save name" onPress={save} />
        <RowAction
          label="Cancel"
          accessibleName="Cancel renaming"
          onPress={onDone}
        />
      </View>
    </View>
  );
}

function FeedRow({ feed }: { feed: ManagedFeed }) {
  const setPinned = useSetPinned();
  const { remove } = useManageActions();
  const [renaming, setRenaming] = useState(false);

  const togglePin = async () => {
    const outcome = await setPinned(feed.id, !feed.pinned);
    if (outcome === "pins-full")
      ToastAndroid.show(
        "You can Pin up to 3 Feeds. Unpin one first.",
        ToastAndroid.SHORT,
      );
  };
  const confirmRemove = () =>
    Alert.alert(
      `Remove ${feed.title}?`,
      "Its Articles go too. Articles you’ve Saved stay in Saved.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: () => void removeFeed(),
        },
      ],
    );
  const removeFeed = async () => {
    if ((await remove(feed.id)) === "failed")
      ToastAndroid.show(
        `Couldn't remove ${feed.title}. Try again.`,
        ToastAndroid.SHORT,
      );
  };

  return (
    // Not grouped into one TalkBack stop: its name, site and each action are reached on their own (Q15).
    <View className="gap-related py-group">
      <View className="flex-row items-center gap-related">
        <FeedIcon
          key={feed.faviconUrl ?? feed.title}
          url={feed.faviconUrl}
          title={feed.title}
          size={ICON}
        />
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
        <View className="flex-row flex-wrap gap-related">
          <RowAction
            label="Rename"
            accessibleName={`Rename ${feed.title}`}
            onPress={() => setRenaming(true)}
          />
          <RowAction
            label={feed.pinned ? "Unpin" : "Pin"}
            accessibleName={`${feed.pinned ? "Unpin" : "Pin"} ${feed.title}`}
            onPress={() => void togglePin()}
          />
          <RowAction
            label="Remove"
            accessibleName={`Remove ${feed.title}`}
            onPress={confirmRemove}
          />
        </View>
      )}
    </View>
  );
}

/** Manage Feeds (D13): rename, remove, Pin and order Feeds, and see which have stopped working (P15). */
export function ManageFeedsScreen() {
  const insets = useSafeAreaInsets();
  const { colorScheme } = useEnvironment();
  const view = useManage();
  const { orderPins } = useManageActions();
  const feeds = view.status === "ready" ? view.feeds : [];
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
      contentContainerStyle={{
        paddingTop: insets.top + spacing.section,
        paddingBottom: insets.bottom + spacing.section,
      }}
      keyboardShouldPersistTaps="handled"
    >
      <AppText variant="title">Manage Feeds</AppText>
      {view.status === "ready" && feeds.length === 0 ? (
        <AppText variant="reading" className="text-text-muted">
          No Feeds yet. Add one from the + on Feeds.
        </AppText>
      ) : null}
      {pinned.length > 0 ? (
        <View className="gap-related">
          <AppText variant="label" className="text-text-muted">
            Pinned
          </AppText>
          <DragList ids={pinned.map((feed) => feed.id)} gap={spacing.related}>
            {pinned.map((feed, index) => (
              <DragRow
                key={feed.id}
                id={feed.id}
                index={index}
                count={pinned.length}
                handleLabel={`Reorder ${feed.title}`}
                onDrop={(to) => move(index, to)}
                handle={
                  <View className="pr-related">
                    <SymbolView
                      name={{
                        ios: "line.3.horizontal",
                        android: "drag_indicator",
                      }}
                      size={HANDLE}
                      tintColor={themes[colorScheme].textMuted}
                    />
                  </View>
                }
              >
                <FeedRow feed={feed} />
              </DragRow>
            ))}
          </DragList>
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
            <FeedRow key={feed.id} feed={feed} />
          ))}
        </View>
      ) : null}
    </ScrollView>
  );
}
