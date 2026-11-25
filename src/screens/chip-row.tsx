import { useEffect, useRef, useState } from 'react';
import { Animated, View, type LayoutChangeEvent, type ScrollViewInstance } from 'react-native';

import { AppText } from '@/components/app-text';
import { DepthPressable } from '@/components/depth-pressable';
import { FeedIcon } from '@/components/feed-icon';
import { useEnvironment } from '@/environment';
import type { FeedChip } from '@/feeds/feeds-data';
import { chipLabel, chipTone, fadeRanges, revealOffset, transparent, type ChipTone } from '@/screens/chip-row-layout';
import { motion } from '@/theme/motion';
import { spacing } from '@/theme/spacing';
import { themes } from '@/theme/tokens';

const ICON = 16;
/** How wide the fade is where the row runs off-screen (FEE-44). */
const FADE = spacing.section;

/**
 * One chip: a tab in the row. Chosen, it's raised (D27) and springs into place (D7); what it shows, in `chipTone`'s
 * colour (Gold when chosen, D5), is its children: a Feed's icon and name.
 */
function Chip({
  accessibleName,
  selected,
  children,
  onPress,
  onLayout,
}: {
  accessibleName: string;
  selected: boolean;
  children: React.ReactNode;
  onPress: () => void;
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
        onPress={onPress}
        // Every chip is an object, not an outline (FEE-74, D27): soft, the chosen one raised, and one under the finger
        // sinks to pressed. Its label identifies it, at 4.5:1 on every face (Q14, D26).
        className="flex-row items-center gap-inside rounded-full px-group py-related"
      >
        {children}
      </DepthPressable>
    </Animated.View>
  );
}

const TONE_CLASS: Record<ChipTone, string> = { accent: 'text-accent', textMuted: 'text-text-muted' };

/** A chip's words: TalkBack hears the chip's own name instead. */
function ChipLabel({ label, tone }: { label: string; tone: ChipTone }) {
  return (
    <AppText variant="label" className={TONE_CLASS[tone]} accessible={false} numberOfLines={1}>
      {label}
    </AppText>
  );
}

/**
 * The chip row under the Feeds top bar (P5, P9, D12): All, then the Feeds in the server's order. Only
 * for choosing what to read: adding a Feed is the top bar's + (FEE-44), and a chip has no other action
 * (Pinned is gone, FEE-94). Where the row runs off-screen it fades, and a chip chosen from elsewhere (a
 * link) scrolls into view.
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
  const { colorScheme, reduceMotion } = useEnvironment();
  const background = themes[colorScheme].background;
  const scroller = useRef<ScrollViewInstance>(null);
  /** Each chip's place in the row, by Feed id (All is ''), measured as it lays out. */
  const chipAt = useRef(new Map<string, { x: number; width: number }>());
  const place = (event: LayoutChangeEvent, id: string) =>
    chipAt.current.set(id, { x: event.nativeEvent.layout.x, width: event.nativeEvent.layout.width });
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
        <Chip accessibleName="All" selected={selected === null} onPress={() => onSelect(null)} onLayout={(event) => place(event, '')}>
          <ChipLabel label="All" tone={chipTone({ selected: selected === null })} />
        </Chip>
        {/* Every chip stays mounted: a chosen one is measured to scroll into view, and a person's Feeds are tens of small pills. */}
        {/* react-doctor-disable-next-line react-doctor/rn-no-scrollview-mapped-list */}
        {chips.map((chip) => (
          <Chip
            key={chip.id}
            accessibleName={chip.title}
            selected={selected === chip.id}
            onPress={() => onSelect(chip.id)}
            onLayout={(event) => place(event, chip.id)}
          >
            <FeedIcon key={chip.faviconUrl} url={chip.faviconUrl} title={chip.title} size={ICON} fallback="none" />
            <ChipLabel label={chipLabel(chip.title)} tone={chipTone({ selected: selected === chip.id })} />
          </Chip>
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
