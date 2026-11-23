import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Pressable,
  StyleSheet,
  View,
  type LayoutChangeEvent,
  type ScrollViewInstance,
} from 'react-native';
import Reanimated, { Easing, Keyframe, LayoutAnimationConfig, LinearTransition, ReduceMotion } from 'react-native-reanimated';

import { AppText } from '@/components/app-text';
import { FeedIcon } from '@/components/feed-icon';
import { useEnvironment } from '@/environment';
import type { FeedChip } from '@/feeds/feeds-data';
import { usePin } from '@/feeds/use-pin';
import { PINNED } from '../../convex/lib/pinned';
import { chipLabel, fadeRanges, hasPinnedView, revealOffset, transparent } from '@/screens/chip-row-layout';
import { motion } from '@/theme/motion';
import { spacing } from '@/theme/spacing';
import { themes } from '@/theme/tokens';

const ICON = 16;
const GROUP_EASING = Easing.bezier(...motion.groupReveal.easing);
/** A revealed chip fades in, travelling a few points out from the Pinned chip (motion.groupReveal). */
const REVEAL = new Keyframe({
  0: { opacity: 0, transform: [{ translateX: -motion.groupReveal.distance }] },
  100: { opacity: 1, transform: [{ translateX: 0 }], easing: GROUP_EASING },
})
  .duration(motion.groupReveal.duration)
  // The chips after the group move first, fast at the start, so the Pinned Feeds appear where room has opened.
  .delay(motion.groupReveal.delay)
  .reduceMotion(ReduceMotion.System);
/** Folding mirrors it: a quick fade, drifting back toward the Pinned chip, before anything closes up. */
const FOLD = new Keyframe({
  0: { opacity: 1, transform: [{ translateX: 0 }] },
  100: { opacity: 0, transform: [{ translateX: -motion.groupReveal.distance }], easing: GROUP_EASING },
})
  .duration(motion.groupReveal.exit)
  .reduceMotion(ReduceMotion.System);
/** Opening: the chips after the group make room at once, on the reveal's own curve and timing. */
const MAKE_ROOM = LinearTransition.duration(motion.groupReveal.duration)
  .easing(GROUP_EASING)
  .reduceMotion(ReduceMotion.System);
/** Folding: they close up only once the group's chips have gone, so nothing slides over a fading chip. */
const CLOSE_UP = LinearTransition.duration(motion.groupReveal.duration)
  .delay(motion.groupReveal.exit)
  .easing(GROUP_EASING)
  .reduceMotion(ReduceMotion.System);
/** How wide the fade is where the row runs off-screen (FEE-44). */
const FADE = spacing.section;

/** Something a chip offers TalkBack besides choosing it (Q15): Pin, Unpin, Expand, Collapse. */
type ChipAction = { name: string; label: string; run: () => void };

/** One chip: a tab in the row. Chosen, it's Gold on the indicator pill (D5) and springs into place (D7). */
function Chip({
  label,
  accessibleName,
  selected,
  active = false,
  expanded,
  icon,
  onPress,
  onLongPress,
  actions,
  onLayout,
}: {
  label: string;
  accessibleName: string;
  selected: boolean;
  /** The Pinned chip while one of its Feeds is chosen: shown as the active group, never Gold (D5, FEE-60). */
  active?: boolean;
  /** The Pinned chip's group, open or folded (FEE-60). */
  expanded?: boolean;
  icon?: React.ReactNode;
  onPress: () => void;
  onLongPress?: () => void;
  actions?: ChipAction[];
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
        aria-expanded={expanded}
        onPress={onPress}
        onLongPress={onLongPress}
        // Long-press for touch, a named action for TalkBack: every action reachable without the gesture (Q15).
        accessibilityActions={actions?.map(({ name, label: actionLabel }) => ({ name, label: actionLabel }))}
        onAccessibilityAction={(event) => {
          actions?.find((action) => action.name === event.nativeEvent.actionName)?.run();
        }}
        // Chosen: Gold on the indicator pill (D5). Unchosen: quiet, a hairline and muted text (FEE-44), so the row
        // never competes with the Articles; the hairline is the muted text colour, which keeps 3:1 (Q14).
        // Every chip has the hairline (transparent when chosen), so choosing one never changes its size.
        // Active (a Pinned Feed chosen): full-strength hairline and text, so the group reads as the one you're in.
        className={
          selected
            ? 'flex-row items-center gap-inside rounded-full border-transparent bg-indicator px-group py-related'
            : active
              ? 'flex-row items-center gap-inside rounded-full border-text px-group py-related'
              : 'flex-row items-center gap-inside rounded-full border-text-muted px-group py-related'
        }
        style={{ borderWidth: StyleSheet.hairlineWidth }}
      >
        {icon}
        <AppText
          variant="label"
          className={selected ? 'text-accent' : active ? 'text-text' : 'text-text-muted'}
          accessible={false}
          numberOfLines={1}
        >
          {chipLabel(label)}
        </AppText>
      </Pressable>
    </Animated.View>
  );
}

/**
 * The Pinned chip's Feeds at a glance (FEE-61): one circle per Pinned Feed, in Pin order, each its
 * icon or its initial (D14), ringed in the page colour so overlapping circles read as separate, each
 * after the first overlapping the one before, like a shared-avatar stack. Sized with the type like
 * every icon beside text (Q16). TalkBack hears the chip's name, which lists the Feeds, not the icons.
 */
function PinnedStack({ chips }: { chips: FeedChip[] }) {
  return (
    <View className="flex-row items-center" importantForAccessibility="no-hide-descendants">
      {chips.map((chip, i) => (
        <View
          key={chip.id}
          testID="pinned-stack-ring"
          className={i === 0 ? 'overflow-hidden rounded-full border-2 border-background' : 'overflow-hidden rounded-full border-2 border-background -ml-related'}
        >
          <FeedIcon key={chip.faviconUrl} url={chip.faviconUrl} title={chip.title} size={ICON} testID={`pinned-stack-${chip.id}`} />
        </View>
      ))}
    </View>
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
  // The Pinned group (FEE-60): open while Pinned or one of its Feeds is chosen, folded otherwise; no state of its own.
  const grouped = hasPinnedView(chips);
  const groupOpen = grouped && (selected === PINNED || pinned.some((chip) => chip.id === selected));
  const shownChips = grouped && !groupOpen ? chips.filter((chip) => !chip.pinned) : chips;
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
        {/* The row draws still the first time; only a real reveal moves (FEE-60). */}
        <LayoutAnimationConfig skipEntering>
          <Chip
            label="All"
            accessibleName="All"
            selected={selected === null}
            onPress={() => onSelect(null)}
            onLayout={(event) => chipAt.current.set('', event.nativeEvent.layout)}
          />
          {/* Two or more Pinned Feeds read together, right after All (FEE-59). It names them for TalkBack. */}
          {grouped ? (
            <Chip
              label="Pinned"
              accessibleName={`Pinned: ${pinned.map((chip) => chip.title).join(', ')}`}
              icon={<PinnedStack chips={pinned} />}
              selected={selected === PINNED}
              active={groupOpen && selected !== PINNED}
              expanded={groupOpen}
              onPress={() => onSelect(PINNED)}
              // Open and folded follow the chosen view (FEE-60): expanding chooses Pinned, collapsing chooses All.
              actions={[groupOpen ? { name: 'collapse', label: 'Collapse', run: () => onSelect(null) } : { name: 'expand', label: 'Expand', run: () => onSelect(PINNED) }]}
              onLayout={(event) => chipAt.current.set(PINNED, event.nativeEvent.layout)}
            />
          ) : null}
          {/* Every chip stays mounted: the reveal needs each one measured, and a person's Feeds are tens of small pills. */}
          {/* react-doctor-disable-next-line react-doctor/rn-no-scrollview-mapped-list */}
          {shownChips.map((chip) => (
            // The group's chips fade in from the Pinned chip, and the rest move over with them; Remove animations makes it instant (Q17).
            // Measured here, on the chip's place in the row, so a chosen chip scrolls into view (D18).
            <Reanimated.View
              key={chip.id}
              entering={REVEAL}
              exiting={FOLD}
              // Chosen as the row changes: open makes room at once, folding closes up after the fade.
              layout={groupOpen ? MAKE_ROOM : CLOSE_UP}
              onLayout={(event) => chipAt.current.set(chip.id, event.nativeEvent.layout)}
            >
              <Chip
                label={chip.title}
                accessibleName={chip.pinned ? `${chip.title}, Pinned` : chip.title}
                selected={selected === chip.id}
                icon={<FeedIcon key={chip.faviconUrl} url={chip.faviconUrl} title={chip.title} size={ICON} fallback="none" />}
                onPress={() => onSelect(chip.id)}
                onLongPress={() => void togglePin(chip)}
                actions={[{ name: 'pin', label: chip.pinned ? 'Unpin' : 'Pin', run: () => void togglePin(chip) }]}
              />
            </Reanimated.View>
          ))}
        </LayoutAnimationConfig>
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
