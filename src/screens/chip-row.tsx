import { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, ScrollView, ToastAndroid, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { FeedIcon } from '@/components/feed-icon';
import { useEnvironment } from '@/environment';
import { useSetPinned, type FeedChip } from '@/feeds/feeds-data';
import { motion } from '@/theme/motion';
import { spacing } from '@/theme/spacing';

const ICON = 16;
/** A chip's name is one line at most this wide (×font size), so a long name can't run off the screen (Q16). */
const CHIP_LABEL_MAX = 180;

/** One chip: a tab in the row. Chosen, it's Gold on the indicator pill (D5) and springs into place (D7). */
function Chip({
  label,
  accessibleName,
  selected,
  icon,
  onPress,
  onLongPress,
  pinLabel,
}: {
  label: string;
  accessibleName: string;
  selected: boolean;
  icon?: React.ReactNode;
  onPress: () => void;
  onLongPress?: () => void;
  /** The long-press action's name, offered to TalkBack too (Q15). */
  pinLabel?: string;
}) {
  const { reduceMotion, fontScale } = useEnvironment();
  const [scale] = useState(() => new Animated.Value(1));
  const wasSelected = useRef(selected);

  useEffect(() => {
    // Only a chip that becomes chosen moves; "Remove animations" keeps just the colour change (Q17).
    if (selected && !wasSelected.current && !reduceMotion) {
      scale.setValue(motion.chipSelect.from);
      Animated.spring(scale, {
        toValue: 1,
        damping: motion.chipSelect.damping,
        stiffness: motion.chipSelect.stiffness,
        useNativeDriver: true,
      }).start();
    }
    wasSelected.current = selected;
  }, [selected, reduceMotion, scale]);

  // A chip that goes mid-spring stops it (Q20).
  useEffect(() => () => scale.stopAnimation(), [scale]);

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Pressable
        role="tab"
        aria-label={accessibleName}
        aria-selected={selected}
        onPress={onPress}
        onLongPress={onLongPress}
        // Long-press for touch, a named action for TalkBack: every action reachable without the gesture (Q15).
        accessibilityActions={pinLabel ? [{ name: 'pin', label: pinLabel }] : undefined}
        onAccessibilityAction={(event) => {
          if (event.nativeEvent.actionName === 'pin') onLongPress?.();
        }}
        className={
          selected
            ? 'flex-row items-center gap-inside rounded-full bg-indicator px-group py-related'
            : 'flex-row items-center gap-inside rounded-full border border-text-muted px-group py-related'
        }
      >
        {icon}
        <View style={{ maxWidth: CHIP_LABEL_MAX * fontScale }}>
          <AppText variant="label" className={selected ? 'text-accent' : 'text-text'} accessible={false} numberOfLines={1}>
            {label}
          </AppText>
        </View>
      </Pressable>
    </Animated.View>
  );
}

/**
 * The chip row under the Feeds top bar (P5, P9, P10): All, then the Feeds in the server's order
 * (Pinned first), then "+" to add one. Long-press Pins or unpins.
 */
export function ChipRow({
  chips,
  selected,
  onSelect,
  onAdd,
}: {
  chips: FeedChip[];
  /** The chosen Feed's id, or null for All. */
  selected: string | null;
  onSelect: (feedId: string | null) => void;
  onAdd: () => void;
}) {
  const setPinned = useSetPinned();

  const togglePin = async (chip: FeedChip) => {
    const outcome = await setPinned(chip.id, !chip.pinned);
    const notes: Record<typeof outcome, string | null> = {
      ok: `${chip.pinned ? 'Unpinned' : 'Pinned'} ${chip.title}.`,
      'pins-full': 'You can Pin up to 3 Feeds. Unpin one first.',
      'not-found': null,
    };
    const note = notes[outcome];
    if (note) ToastAndroid.show(note, ToastAndroid.SHORT);
  };

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      role="tablist"
      aria-label="Feeds"
      contentContainerClassName="items-center gap-related px-edge"
      contentContainerStyle={{ paddingBottom: spacing.related }}
    >
      <Chip label="All" accessibleName="All" selected={selected === null} onPress={() => onSelect(null)} />
      {chips.map((chip) => (
        <Chip
          key={chip.id}
          label={chip.title}
          accessibleName={chip.pinned ? `${chip.title}, Pinned` : chip.title}
          selected={selected === chip.id}
          icon={<FeedIcon key={chip.faviconUrl} url={chip.faviconUrl} title={chip.title} size={ICON} fallback="none" />}
          onPress={() => onSelect(chip.id)}
          onLongPress={() => void togglePin(chip)}
          pinLabel={chip.pinned ? 'Unpin' : 'Pin'}
        />
      ))}
      <Pressable
        role="button"
        aria-label="Add a Feed"
        onPress={onAdd}
        className="rounded-full border border-text-muted px-group py-related"
      >
        <AppText variant="label" className="text-text" accessible={false}>
          +
        </AppText>
      </Pressable>
    </ScrollView>
  );
}
