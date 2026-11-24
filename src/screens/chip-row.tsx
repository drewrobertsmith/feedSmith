import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  View,
  type LayoutChangeEvent,
  type ScrollViewInstance,
} from 'react-native';
import Reanimated, { Easing, Keyframe, LayoutAnimationConfig, LinearTransition, ReduceMotion } from 'react-native-reanimated';

import { AppSymbol } from '@/components/app-symbol';
import { AppText } from '@/components/app-text';
import { DepthPressable, useControlFace } from '@/components/depth-pressable';
import { FeedIcon } from '@/components/feed-icon';
import { useEnvironment } from '@/environment';
import type { FeedChip } from '@/feeds/feeds-data';
import { usePin } from '@/feeds/use-pin';
import { PINNED } from '../../convex/lib/pinned';
import { chipLabel, chipTone, fadeRanges, hasPinnedView, revealOffset, transparent, type ChipTone } from '@/screens/chip-row-layout';
import { depthStyle } from '@/theme/depth';
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

/**
 * One chip: a tab in the row. Chosen, it's raised (D27) and springs into place (D7); what it shows, in `chipTone`'s
 * colour (Gold when chosen, D5), is its children: a Feed's icon and name, or the Pinned chip's glyph and icons.
 */
function Chip({
  accessibleName,
  selected,
  expanded,
  children,
  onPress,
  onLongPress,
  actions,
  onLayout,
}: {
  accessibleName: string;
  selected: boolean;
  /** The Pinned chip's group, open or folded (FEE-60). */
  expanded?: boolean;
  children: React.ReactNode;
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
      <DepthPressable
        level={selected ? 'raised' : 'soft'}
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
        // Every chip is an object, not an outline (FEE-74, D27): soft, the chosen one raised, and one under the finger
        // sinks to pressed. Its label or glyph identifies it, at 4.5:1 or 3:1 on every face (Q14, D26).
        className="flex-row items-center gap-inside rounded-full px-group py-related"
      >
        {children}
      </DepthPressable>
    </Animated.View>
  );
}

const TONE_CLASS: Record<ChipTone, string> = { accent: 'text-accent', text: 'text-text', textMuted: 'text-text-muted' };

/** A chip's words: TalkBack hears the chip's own name instead. */
function ChipLabel({ label, tone }: { label: string; tone: ChipTone }) {
  return (
    <AppText variant="label" className={TONE_CLASS[tone]} accessible={false} numberOfLines={1}>
      {label}
    </AppText>
  );
}

/** The Pinned chip's push-pin (FEE-84), in the label's colour and size, growing with the type (Q16). */
function PinnedGlyph({ tone }: { tone: ChipTone }) {
  const { colorScheme } = useEnvironment();
  return (
    <AppSymbol
      testID="pinned-glyph"
      name={{ ios: 'pin.fill', android: 'push_pin' }}
      size={ICON}
      tintColor={themes[colorScheme][tone]}
      importantForAccessibility="no-hide-descendants"
    />
  );
}

/**
 * The Pinned chip's Feeds at a glance (FEE-61): one circle per Pinned Feed, in Pin order, each its
 * icon or its initial (D14) on a surface disc, ringed in the page colour so overlapping circles read
 * as separate, each after the first overlapping the one before by one inside step, like a
 * shared-avatar stack. Sized with the type like
 * every icon beside text (Q16). TalkBack hears the chip's name, which lists the Feeds, not the icons.
 */
function PinnedStack({ chips }: { chips: FeedChip[] }) {
  // Ringed in the chip's own face, so on it each icon reads as a separate disc (D25, FEE-74).
  const ring = useControlFace();
  return (
    <View className="flex-row items-center" importantForAccessibility="no-hide-descendants">
      {chips.map((chip, i) => (
        <View
          key={chip.id}
          testID="pinned-stack-ring"
          // A surface backdrop, so a transparent logo still reads as a disc; overlapping by one inside step keeps each glyph whole.
          className={
            i === 0
              ? 'items-center justify-center overflow-hidden rounded-full border-2 bg-surface'
              : 'items-center justify-center overflow-hidden rounded-full border-2 bg-surface -ml-inside'
          }
          style={{ borderColor: ring }}
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
  initiallyHidden = false,
}: {
  chips: FeedChip[];
  /** The chosen Feed's id, `PINNED` for the Pinned view, or null for All. */
  selected: string | null;
  onSelect: (feedId: string | null) => void;
  /** With Pinned chosen, its group starts hidden (the state gallery; tests tap the chip). */
  initiallyHidden?: boolean;
}) {
  const pin = usePin();
  const pinned = chips.filter((chip) => chip.pinned);
  const onPinned = selected === PINNED;
  // Tapping the chosen Pinned chip hides or shows its group (FEE-84): screen state only, so every new choice
  // (a tap, a link, restoring) starts with it shown. Reset as the choice changes, during render.
  const [hidden, setHidden] = useState(initiallyHidden);
  const [hiddenFor, setHiddenFor] = useState(selected);
  if (hiddenFor !== selected) {
    setHiddenFor(selected);
    setHidden(false);
  }
  // The Pinned group (FEE-60): open while Pinned (unless hidden) or one of its Feeds is chosen, folded otherwise.
  const grouped = hasPinnedView(chips);
  const groupOpen = grouped && ((onPinned && !hidden) || pinned.some((chip) => chip.id === selected));
  // The Pinned Feeds' chips sit in the tray while the group is open (FEE-85); the rest follow it, in order.
  const trayChips = groupOpen ? pinned : [];
  const rowChips = grouped ? chips.filter((chip) => !chip.pinned) : chips;
  const { colorScheme, reduceMotion } = useEnvironment();
  const background = themes[colorScheme].background;
  const scroller = useRef<ScrollViewInstance>(null);
  /** Each chip's place, by Feed id (All is ''), measured as it lays out: in the row, or in the tray (FEE-85). */
  const chipAt = useRef(new Map<string, { x: number; width: number; inTray: boolean }>());
  /** Where the tray starts in the row, since a chip inside it is measured from the tray. */
  const trayX = useRef(0);
  const place = (event: LayoutChangeEvent, id: string, inTray = false) =>
    chipAt.current.set(id, { x: event.nativeEvent.layout.x, width: event.nativeEvent.layout.width, inTray });
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
    const at = chipAt.current.get(selected ?? '');
    const chip = at && { x: at.inTray ? trayX.current + at.x : at.x, width: at.width };
    if (!chip || row.width === 0) return;
    revealed.current = selected;
    const to = revealOffset(chip, { scrollX: scrollX.current, width: row.width, fade: FADE, edge: spacing.edge });
    if (to === null) return;
    scroller.current?.scrollTo({ x: to, animated: !reduceMotion });
    scrollX.current = Math.min(to, Math.max(0, row.content - row.width));
  }, [selected, reduceMotion, row.width, row.content]);

  const togglePin = (chip: FeedChip) => void pin(chip);

  /**
   * A Feed's chip, in the row or in the tray. The group's chips fade in from the Pinned chip, and the rest move over with
   * them. Remove animations (Q17) takes the animations away entirely, read from the environment like all motion here:
   * Reanimated's own reduced-motion skip left a revealed chip's gradient face invisible on Android (FEE-74). Measured
   * here, on the chip's place, so a chosen chip scrolls into view (D18).
   */
  const feedChip = (chip: FeedChip, inTray: boolean) => (
    <Reanimated.View
      key={chip.id}
      entering={reduceMotion ? undefined : REVEAL}
      exiting={reduceMotion ? undefined : FOLD}
      // Chosen as the row changes: open makes room at once, folding closes up after the fade.
      layout={reduceMotion ? undefined : groupOpen ? MAKE_ROOM : CLOSE_UP}
      onLayout={(event) => place(event, chip.id, inTray)}
    >
      <Chip
        accessibleName={chip.pinned ? `${chip.title}, Pinned` : chip.title}
        selected={selected === chip.id}
        onPress={() => onSelect(chip.id)}
        onLongPress={() => void togglePin(chip)}
        actions={[{ name: 'pin', label: chip.pinned ? 'Unpin' : 'Pin', run: () => void togglePin(chip) }]}
      >
        <FeedIcon key={chip.faviconUrl} url={chip.faviconUrl} title={chip.title} size={ICON} fallback="none" />
        <ChipLabel label={chipLabel(chip.title)} tone={chipTone({ selected: selected === chip.id })} />
      </Chip>
    </Reanimated.View>
  );

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
            accessibleName="All"
            selected={selected === null}
            onPress={() => onSelect(null)}
            onLayout={(event) => place(event, '')}
          >
            <ChipLabel label="All" tone={chipTone({ selected: selected === null })} />
          </Chip>
          {/* Two or more Pinned Feeds read together, right after All (FEE-59), set apart in one recessed tray (FEE-85):
              the Pinned chip, and its Feeds' chips while the group is open. The tray is a face, not a control: TalkBack
              passes over it to the chips and taps go through to them. It widens and narrows on the same transition as
              the chips after it, so its edge moves with them. */}
          {grouped ? (
            <Reanimated.View
              testID="pinned-tray"
              pointerEvents="box-none"
              layout={reduceMotion ? undefined : groupOpen ? MAKE_ROOM : CLOSE_UP}
              onLayout={(event) => {
                trayX.current = event.nativeEvent.layout.x;
              }}
              className="flex-row items-center gap-related rounded-full p-inside"
              style={depthStyle(colorScheme, 'inset')}
            >
              <Chip
                accessibleName={`Pinned: ${pinned.map((chip) => chip.title).join(', ')}`}
                selected={onPinned}
                expanded={groupOpen}
                // Chosen already, a tap hides or shows the group and you keep reading Pinned; otherwise it chooses Pinned,
                // which always opens the group (FEE-84).
                onPress={() => (onPinned ? setHidden((now) => !now) : onSelect(PINNED))}
                // TalkBack's actions follow the tap's rules: on chosen Pinned they hide and show; elsewhere Expand
                // chooses Pinned and Collapse (a Pinned Feed chosen) chooses All, as before (FEE-60).
                actions={[
                  groupOpen
                    ? { name: 'collapse', label: 'Collapse', run: () => (onPinned ? setHidden(true) : onSelect(null)) }
                    : { name: 'expand', label: 'Expand', run: () => (onPinned ? setHidden(false) : onSelect(PINNED)) },
                ]}
                onLayout={(event) => place(event, PINNED, true)}
              >
                {/* No word (FEE-84): a push-pin sets it apart from a Feed's chip without relying on colour, then its
                    Feeds' icons. Active while one of its Feeds is chosen (FEE-60). */}
                <PinnedGlyph tone={chipTone({ selected: onPinned, active: groupOpen && !onPinned })} />
                <PinnedStack chips={pinned} />
              </Chip>
              {trayChips.map((chip) => feedChip(chip, true))}
            </Reanimated.View>
          ) : null}
          {/* Every chip in the row stays mounted: the reveal needs each one measured, and a person's Feeds are tens of small pills. */}
          {/* react-doctor-disable-next-line react-doctor/rn-no-scrollview-mapped-list */}
          {rowChips.map((chip) => feedChip(chip, false))}
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
