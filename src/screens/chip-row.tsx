import { useEffect, useRef, useState } from 'react';
import { Animated, View, type LayoutChangeEvent, type ScrollViewInstance } from 'react-native';
import Reanimated, { cubicBezier } from 'react-native-reanimated';

import { AppSymbol } from '@/components/app-symbol';
import { DepthPressable } from '@/components/depth-pressable';
import { FeedIcon } from '@/components/feed-icon';
import { NativeMenu } from '@/components/native-menu';
import { useEnvironment, useMinuteClock, useSizeScale } from '@/environment';
import type { FeedChip } from '@/feeds/feeds-data';
import { chipLabel, chipSettle, chipTone, fadeRanges, notUpdating, revealOffset, transparent, type ChipTone } from '@/screens/chip-row-layout';
import { typeScale } from '@/theme/type';
import { spacing } from '@/theme/spacing';
import { themes } from '@/theme/tokens';

const ICON = 16;
/** The not-updating badge: its glyph, and the notch of page colour it sits in on the chip's corner (FEE-126). */
const BADGE = 16;
const NOTCH = 24;
/** How wide the fade is where the row runs off-screen (FEE-44). */
const FADE = spacing.section;

/**
 * One chip: a tab in the row. Chosen, it's raised (D27) and springs into place (D7); what it shows, in `chipTone`'s
 * colour (Gold when chosen, D5), is its children: a Feed's icon and name. A Feed's chip also holds Remove: a
 * long-press opens its menu (`onLongPress`), and TalkBack offers it as an action by name (`remove`, Q15).
 */
function Chip({
  accessibleName,
  selected,
  children,
  onPress,
  onLayout,
  onLongPress,
  remove,
  notUpdating: failing = false,
}: {
  accessibleName: string;
  selected: boolean;
  children: React.ReactNode;
  onPress: () => void;
  onLayout?: (event: LayoutChangeEvent) => void;
  onLongPress?: () => void;
  remove?: { label: string; onRemove: () => void };
  /** Its Feed has failed every try for a day (FEE-126): a badge on its corner, and its name says so. */
  notUpdating?: boolean;
}) {
  const settle = useChipSettle();
  // A badged chip makes room on its right, so its name never runs under the badge's notch, at any size.
  const badgeRoom = (NOTCH / 4) * useSizeScale();
  return (
    <View onLayout={onLayout}>
      <DepthPressable
        level={selected ? 'raised' : 'soft'}
        settle={settle}
        role="tab"
        aria-label={failing ? `${accessibleName}, not updating` : accessibleName}
        aria-selected={selected}
        onPress={onPress}
        onLongPress={onLongPress}
        accessibilityActions={remove ? [{ name: 'remove', label: remove.label }] : undefined}
        onAccessibilityAction={remove ? (event) => event.nativeEvent.actionName === 'remove' && remove.onRemove() : undefined}
        // Every chip is an object, not an outline (FEE-74, D27): soft, the chosen one raised, and one under the finger
        // sinks to pressed. Its label identifies it, at 4.5:1 on every face (Q14, D26).
        className="flex-row items-center gap-inside rounded-full px-group py-related"
        style={failing ? { paddingRight: spacing.group + badgeRoom } : undefined}
      >
        {children}
      </DepthPressable>
      {failing ? <NotUpdatingBadge tone={chipTone({ selected })} /> : null}
    </View>
  );
}

/**
 * A Feed that has stopped updating (FEE-126): a warning glyph in its chip's label tone (no new colour, Q30),
 * notched into the page colour on the chip's top-right corner, so it reads as a mark on that chip and not a
 * control. It takes no touch, and TalkBack hears it in the chip's name. It grows with the font size (Q16).
 */
function NotUpdatingBadge({ tone }: { tone: ChipTone }) {
  const { colorScheme } = useEnvironment();
  const notch = NOTCH * useSizeScale();
  return (
    <View
      testID="not-updating-badge"
      pointerEvents="none"
      accessible={false}
      className="absolute items-center justify-center rounded-full bg-background"
      style={{ top: -notch / 3, right: -notch / 4, width: notch, height: notch }}
    >
      <AppSymbol name={{ ios: 'exclamationmark.triangle', android: 'warning' }} size={BADGE} tintColor={themes[colorScheme][tone]} />
    </View>
  );
}

/** How a chip changes state (FEE-117): eased, or at once with Remove animations on (Q17). */
function useChipSettle() {
  return chipSettle(useEnvironment().reduceMotion);
}

/**
 * A chip's words, in `chipTone`'s colour (Gold when chosen, D5), easing with the chip's face (FEE-117). Drawn
 * as the label variant (D6), like `AppText`, which takes no style to ease. TalkBack hears the chip's own name.
 */
function ChipLabel({ label, tone }: { label: string; tone: ChipTone }) {
  const { colorScheme, fontScale } = useEnvironment();
  const { duration, easing } = useChipSettle();
  const { fontSize, lineHeight, ...face } = typeScale.label;
  return (
    <Reanimated.Text
      accessible={false}
      numberOfLines={1}
      style={{
        ...face,
        fontSize: fontSize * fontScale,
        lineHeight: lineHeight * fontScale,
        color: themes[colorScheme][tone],
        transitionProperty: 'color',
        transitionDuration: duration,
        transitionTimingFunction: cubicBezier(...easing),
      }}
    >
      {label}
    </Reanimated.Text>
  );
}

/** Where a chip sits in the row's content, as it last laid out. */
type Box = { x: number; y: number; width: number; height: number };
const NO_BOX: Box = { x: 0, y: 0, width: 0, height: 0 };

/**
 * The chip whose menu is showing (FEE-97), and where it sits: the menu anchors to an empty box laid over
 * it. It stays after the menu closes, so the menu can leave on its own motion.
 */
type Menu = { id: string; open: boolean; box?: Box };

/**
 * The chip row under the Feeds top bar (P5, P9, D12): All, then the Feeds in the server's order. For
 * choosing what to read: adding a Feed is the top bar's + (FEE-44), and a Feed's only other action,
 * Remove, waits behind a long-press (FEE-97). Where the row runs off-screen it fades, and a chip chosen
 * from elsewhere (a link) scrolls into view. `menuFor`, a Feed's id, opens its menu at once, for the
 * state gallery.
 */
export function ChipRow({
  chips,
  selected,
  onSelect,
  onRemove,
  menuFor,
}: {
  chips: FeedChip[];
  /** The chosen Feed's id, or null for All. */
  selected: string | null;
  onSelect: (feedId: string | null) => void;
  /** Remove chosen from a Feed's menu, or by TalkBack: the screen asks first (T23). */
  onRemove: (chip: FeedChip) => void;
  menuFor?: string;
}) {
  const { colorScheme, reduceMotion } = useEnvironment();
  const background = themes[colorScheme].background;
  // A day of failing is told on the app's own clock, so a badge appears without the server saying so again.
  const now = useMinuteClock();
  // Room above the chips for a badge's notch, so the row never clips it (FEE-126).
  const badgeRoom = (NOTCH / 3) * useSizeScale();
  const scroller = useRef<ScrollViewInstance>(null);
  /** Each chip's place in the row, by Feed id (All is ''), measured as it lays out. */
  const chipAt = useRef(new Map<string, Box>());
  const [menu, setMenu] = useState<Menu | null>(menuFor ? { id: menuFor, open: true } : null);
  const place = (event: LayoutChangeEvent, id: string) => {
    const { x, y, width, height } = event.nativeEvent.layout;
    chipAt.current.set(id, { x, y, width, height });
    // A menu opened before its chip was measured (the gallery's) finds its place now.
    setMenu((now) => (now?.id === id && !now.box ? { ...now, box: { x, y, width, height } } : now));
  };
  const openMenu = (id: string) => setMenu({ id, open: true, box: chipAt.current.get(id) });
  const menuChip = menu ? chips.find((chip) => chip.id === menu.id) : undefined;
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
        // Room for a badge grows only with Android's font size, never on a scroll or a keyboard (FEE-126).
        // react-doctor-disable-next-line react-doctor/rn-scrollview-dynamic-padding
        contentContainerStyle={{ paddingTop: badgeRoom, paddingBottom: spacing.related }}
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
            onLongPress={() => openMenu(chip.id)}
            remove={{ label: `Remove ${chip.title}`, onRemove: () => onRemove(chip) }}
            notUpdating={notUpdating(chip, now)}
          >
            <FeedIcon key={chip.faviconUrl} url={chip.faviconUrl} title={chip.title} size={ICON} fallback="none" />
            <ChipLabel label={chipLabel(chip.title)} tone={chipTone({ selected: selected === chip.id })} />
          </Chip>
        ))}
        {menu && menuChip ? (
          // The menu's anchor: an empty box over the chip, scrolling with it, that never takes a touch. The chips
          // themselves stay plain React Native, since Android's host around a chip would clip its shadow (D27).
          <View
            pointerEvents="box-none"
            className="absolute"
            style={{ left: (menu.box ?? NO_BOX).x, top: (menu.box ?? NO_BOX).y }}
          >
            <NativeMenu
              open={menu.open}
              onClose={() => setMenu((now) => now && { ...now, open: false })}
              actions={[{ label: `Remove ${menuChip.title}`, destructive: true, onPress: () => onRemove(menuChip) }]}
            >
              <View style={{ width: (menu.box ?? NO_BOX).width, height: (menu.box ?? NO_BOX).height }} />
            </NativeMenu>
          </View>
        ) : null}
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
