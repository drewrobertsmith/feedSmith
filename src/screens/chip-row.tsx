import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Pressable,
  ScrollView,
  StyleSheet,
  ToastAndroid,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollViewInstance,
} from 'react-native';

import { AppText } from '@/components/app-text';
import { FeedIcon } from '@/components/feed-icon';
import { useEnvironment } from '@/environment';
import { useSetPinned, type FeedChip } from '@/feeds/feeds-data';
import { chipLabel, edgeFades } from '@/screens/chip-row-layout';
import { motion } from '@/theme/motion';
import { spacing } from '@/theme/spacing';
import { themes } from '@/theme/tokens';

const ICON = 16;
/** How wide the fade is where the row runs off-screen (FEE-44). */
const FADE = spacing.section;

/** One chip: a tab in the row. Chosen, it's Gold on the indicator pill (D5) and springs into place (D7). */
function Chip({
  label,
  accessibleName,
  selected,
  icon,
  onPress,
  onLongPress,
  pinLabel,
  onLayout,
}: {
  label: string;
  accessibleName: string;
  selected: boolean;
  icon?: React.ReactNode;
  onPress: () => void;
  onLongPress?: () => void;
  /** The long-press action's name, offered to TalkBack too (Q15). */
  pinLabel?: string;
  onLayout?: (event: LayoutChangeEvent) => void;
}) {
  const { reduceMotion } = useEnvironment();
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
    <Animated.View style={{ transform: [{ scale }] }} onLayout={onLayout}>
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
        // Chosen: Gold on the indicator pill (D5). Unchosen: quiet, a hairline and muted text (FEE-44), so the row
        // never competes with the Articles; the hairline is the muted text colour, which keeps 3:1 (Q14).
        className={
          selected
            ? 'flex-row items-center gap-inside rounded-full bg-indicator px-group py-related'
            : 'flex-row items-center gap-inside rounded-full border-text-muted px-group py-related'
        }
        style={selected ? undefined : { borderWidth: StyleSheet.hairlineWidth }}
      >
        {icon}
        <AppText variant="label" className={selected ? 'text-accent' : 'text-text-muted'} accessible={false} numberOfLines={1}>
          {chipLabel(label)}
        </AppText>
      </Pressable>
    </Animated.View>
  );
}

/**
 * The chip row under the Feeds top bar (P5, P9, D12): All, then the Feeds in the server's order
 * (Pinned first). Only for choosing what to read: adding a Feed is the top bar's + (FEE-44). Long-
 * press Pins or unpins. Where the row runs off-screen it fades, and a chip chosen from elsewhere
 * (a link) scrolls into view.
 */
export function ChipRow({
  chips,
  selected,
  onSelect,
}: {
  chips: FeedChip[];
  /** The chosen Feed's id, or null for All. */
  selected: string | null;
  onSelect: (feedId: string | null) => void;
}) {
  const setPinned = useSetPinned();
  const { colorScheme, reduceMotion } = useEnvironment();
  const background = themes[colorScheme].background;
  const scroller = useRef<ScrollViewInstance>(null);
  /** Each chip's left edge in the row, by Feed id (All is ''), measured as it lays out. */
  const chipX = useRef(new Map<string, number>());
  const [row, setRow] = useState({ x: 0, width: 0, content: 0 });
  /** Where the row is scrolled to, for the effect below: a user's own scroll must never re-run it. */
  const scrollX = useRef(0);
  const fades = edgeFades(row.x, row.width, row.content);

  // A chip chosen from elsewhere (a link) is brought into view; one tapped in the row already is. It runs when the
  // choice changes or the row lays out, never on a scroll, so it can't pull the row back from under a finger.
  useEffect(() => {
    const x = chipX.current.get(selected ?? '');
    if (x === undefined) return;
    if (x >= scrollX.current && x <= scrollX.current + row.width - FADE * 2) return;
    scroller.current?.scrollTo({ x: Math.max(0, x - spacing.edge), animated: !reduceMotion });
  }, [selected, reduceMotion, row.width, row.content]);

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

  const scrolled = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const x = event.nativeEvent.contentOffset.x;
    scrollX.current = x;
    setRow((now) => (Math.abs(now.x - x) < 1 ? now : { ...now, x }));
  };

  return (
    <View>
      <ScrollView
        ref={scroller}
        horizontal
        showsHorizontalScrollIndicator={false}
        testID="chip-row"
        role="tablist"
        aria-label="Feeds"
        onScroll={scrolled}
        scrollEventThrottle={32}
        onLayout={(event) => setRow((now) => ({ ...now, width: event.nativeEvent.layout.width }))}
        onContentSizeChange={(content) => setRow((now) => ({ ...now, content }))}
        contentContainerClassName="items-center gap-related px-edge"
        contentContainerStyle={{ paddingBottom: spacing.related }}
      >
        <Chip
          label="All"
          accessibleName="All"
          selected={selected === null}
          onPress={() => onSelect(null)}
          onLayout={(event) => chipX.current.set('', event.nativeEvent.layout.x)}
        />
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
            onLayout={(event) => chipX.current.set(chip.id, event.nativeEvent.layout.x)}
          />
        ))}
      </ScrollView>
      {/* More chips lie past a faded edge; the fade is the page's own colour, so it never greys. */}
      {fades.start ? (
        <View
          testID="chip-fade-start"
          pointerEvents="none"
          className="absolute bottom-0 left-0 top-0"
          style={{ width: FADE, backgroundImage: `linear-gradient(to left, ${background}00, ${background})` }}
        />
      ) : null}
      {fades.end ? (
        <View
          testID="chip-fade-end"
          pointerEvents="none"
          className="absolute bottom-0 right-0 top-0"
          style={{ width: FADE, backgroundImage: `linear-gradient(to right, ${background}00, ${background})` }}
        />
      ) : null}
    </View>
  );
}
