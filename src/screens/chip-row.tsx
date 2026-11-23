import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Pressable,
  StyleSheet,
  View,
  type LayoutChangeEvent,
  type ScrollViewInstance,
} from 'react-native';

import { AppText } from '@/components/app-text';
import { FeedIcon } from '@/components/feed-icon';
import { useEnvironment } from '@/environment';
import type { FeedChip } from '@/feeds/feeds-data';
import { usePin } from '@/feeds/use-pin';
import { PINNED } from '../../convex/lib/pinned';
import { chipLabel, fadeRanges, revealOffset, transparent } from '@/screens/chip-row-layout';
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
        // Every chip has the hairline (transparent when chosen), so choosing one never changes its size.
        className={
          selected
            ? 'flex-row items-center gap-inside rounded-full border-transparent bg-indicator px-group py-related'
            : 'flex-row items-center gap-inside rounded-full border-text-muted px-group py-related'
        }
        style={{ borderWidth: StyleSheet.hairlineWidth }}
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
  /** The chosen Feed's id, `PINNED` for the Pinned view, or null for All. */
  selected: string | null;
  onSelect: (feedId: string | null) => void;
}) {
  const pin = usePin();
  const pinned = chips.filter((chip) => chip.pinned);
  const { colorScheme, reduceMotion } = useEnvironment();
  const background = themes[colorScheme].background;
  const scroller = useRef<ScrollViewInstance>(null);
  /** Each chip's place in the row, by Feed id (All is ''), measured as it lays out. */
  const chipAt = useRef(new Map<string, { x: number; width: number }>());
  const [row, setRow] = useState({ width: 0, content: 0 });
  /** Where the row is scrolled to: native for the fades, a ref for the reveal (no React state on a scroll). */
  const [scroll] = useState(() => new Animated.Value(0));
  const scrollX = useRef(0);
  const [onScroll] = useState(() =>
    Animated.event([{ nativeEvent: { contentOffset: { x: scroll } } }], { useNativeDriver: true }),
  );
  const fades = fadeRanges(row.width, row.content, FADE);
  /** The choice last brought into view; undefined until the row has laid out once. */
  const revealed = useRef<string | null | undefined>(undefined);

  // The chosen chip is brought wholly into view once per choice: a link's chip from past the edge, or a tapped one
  // half under a fade. It never runs again for the same choice, so nothing (a scroll, a Feed added) pulls the row back.
  useEffect(() => {
    if (revealed.current === selected) return;
    const chip = chipAt.current.get(selected ?? '');
    if (!chip || row.width === 0) return;
    revealed.current = selected;
    const to = revealOffset(chip, { scrollX: scrollX.current, width: row.width, fade: FADE, edge: spacing.edge });
    if (to === null) return;
    scroller.current?.scrollTo({ x: to, animated: !reduceMotion });
    scrollX.current = Math.min(to, Math.max(0, row.content - row.width));
  }, [selected, reduceMotion, row.width, row.content]);

  const togglePin = (chip: FeedChip) => void pin(chip);

  return (
    <View>
      <Animated.ScrollView
        ref={scroller}
        horizontal
        showsHorizontalScrollIndicator={false}
        testID="chip-row"
        role="tablist"
        aria-label="Feeds"
        onScroll={onScroll}
        // Where a person's scroll comes to rest, for the reveal; the fades follow every frame natively.
        onScrollEndDrag={(event) => {
          scrollX.current = event.nativeEvent.contentOffset.x;
        }}
        onMomentumScrollEnd={(event) => {
          scrollX.current = event.nativeEvent.contentOffset.x;
        }}
        scrollEventThrottle={16}
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
          onLayout={(event) => chipAt.current.set('', event.nativeEvent.layout)}
        />
        {/* Two or more Pinned Feeds read together, right after All (FEE-59). It names them for TalkBack. */}
        {pinned.length >= 2 ? (
          <Chip
            label="Pinned"
            accessibleName={`Pinned: ${pinned.map((chip) => chip.title).join(', ')}`}
            selected={selected === PINNED}
            onPress={() => onSelect(PINNED)}
            onLayout={(event) => chipAt.current.set(PINNED, event.nativeEvent.layout)}
          />
        ) : null}
        {/* Every chip stays mounted: the reveal needs each one measured, and a person's Feeds are tens of small pills. */}
        {/* react-doctor-disable-next-line react-doctor/rn-no-scrollview-mapped-list */}
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
            onLayout={(event) => chipAt.current.set(chip.id, event.nativeEvent.layout)}
          />
        ))}
      </Animated.ScrollView>
      {/* More chips lie past a faded edge; the fade is the page's own colour, so it never greys. */}
      {fades ? (
        <>
          <Animated.View
            testID="chip-fade-start"
            pointerEvents="none"
            className="absolute bottom-0 left-0 top-0"
            style={{
              width: FADE,
              opacity: scroll.interpolate({ inputRange: fades.start, outputRange: [0, 1], extrapolate: 'clamp' }),
              backgroundImage: `linear-gradient(to left, ${transparent(background)}, ${background})`,
            }}
          />
          <Animated.View
            testID="chip-fade-end"
            pointerEvents="none"
            className="absolute bottom-0 right-0 top-0"
            style={{
              width: FADE,
              opacity: scroll.interpolate({ inputRange: fades.end, outputRange: [1, 0], extrapolate: 'clamp' }),
              backgroundImage: `linear-gradient(to right, ${transparent(background)}, ${background})`,
            }}
          />
        </>
      ) : null}
    </View>
  );
}
