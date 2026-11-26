import { Image } from 'expo-image';
import { router, useIsFocused } from 'expo-router';
import { useCallback, useEffect, useEffectEvent, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { StyleSheet, useWindowDimensions, View, type LayoutChangeEvent } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  type SharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { ArticleRowContent } from '@/components/article-row';
import { READ_IMAGE_OPACITY, ROW_CLASS } from '@/components/article-row-style';
import { rectOf, type ViewRef } from '@/navigation/measure';
import { useEnvironment } from '@/environment';
import { clearOrigin, getOrigin, measureRow, type Origin } from '@/navigation/article-origin';
import {
  containerFrame,
  fadeThrough,
  isOnScreen,
  lerpRect,
  type Edge,
  type Rect,
  type Size,
} from '@/navigation/container-transform';
import { usePredictiveBack, type BackEvent } from '@/navigation/predictive-back';
import { LeadSlotContext } from '@/screens/reading/lead-slot-context';
import { motion } from '@/theme/motion';
import { palette, themes } from '@/theme/tokens';

const { duration, close, easing, rise, scrim } = motion.articleOpen;
const EMPHASIZED = Easing.bezier(...easing);
/** How long opening waits for the page to lay out its lead image before it goes without it (FEE-114). */
const LEAD_WAIT = 120;
/** How long a landed picture waits for the lead image to draw before handing over anyway (FEE-114). */
const LEAD_DRAW_WAIT = 600;

/**
 * How the page comes and goes (FEE-114): `row` grows from the tapped row and shrinks back into it,
 * Material's container transform; `axis` fades from and to slightly smaller, Material's shared axis Z, with
 * no row to use.
 */
type Path = 'row' | 'axis';
/**
 * The row's thumbnail, the one picture the transition draws (FEE-114): it travels to the lead image when the
 * page has placed one (`lead`), else rides in the row and fades with it.
 */
type Flight = { thumb: Rect; lead?: Rect; read: boolean };

/**
 * The page's frame now (FEE-114). The shared values come in as arguments, not from this function's closure,
 * so each animated style that calls it holds them itself and runs again when any of them changes (Reanimated
 * subscribes a style to the shared values in its own closure only).
 */
function frameOf(
  progress: SharedValue<number>,
  back: SharedValue<number>,
  edge: SharedValue<Edge>,
  row: SharedValue<Rect>,
  size: SharedValue<Size>,
  rowPath: boolean,
) {
  'worklet';
  return containerFrame({
    path: rowPath ? 'row' : 'axis',
    progress: progress.get(),
    back: back.get(),
    edge: edge.get(),
    row: row.get(),
    screen: size.get(),
  });
}

/** The navigator drops the page at once: the transition has already moved it. */
const goBack = (id: string) => {
  clearOrigin(id);
  router.back();
};

/**
 * Android's back gesture, while `enabled` (FEE-114): `back` follows the finger, a cancel springs it home with
 * no overshoot, and a commit (or a back button) calls `onCommit` to finish the move.
 */
function useBackGesture(
  enabled: boolean,
  { back, edge }: { back: SharedValue<number>; edge: SharedValue<Edge> },
  onCommit: () => void,
) {
  usePredictiveBack(enabled, (event: BackEvent) => {
    if (event.type === 'started') edge.set(event.edge);
    if (event.type === 'started' || event.type === 'progress') back.set(event.progress);
    else if (event.type === 'cancelled') back.set(withSpring(0, motion.predictiveBack.cancel));
    else onCommit();
  });
}

/** The shared values one move runs on (FEE-114). */
type MoveValues = {
  progress: SharedValue<number>;
  back: SharedValue<number>;
  edge: SharedValue<Edge>;
  rowRect: SharedValue<Rect>;
  size: SharedValue<Size>;
  closing: SharedValue<boolean>;
  flying: SharedValue<boolean>;
  /** False until the move starts: the transition stays unseen over the real row while its picture loads. */
  revealed: SharedValue<boolean>;
};

/** Every part of the move, each drawn from the same frame (`frameOf`), so they never disagree. */
function useMoveStyles({ values, rowPath, flight }: { values: MoveValues; rowPath: boolean; flight?: Flight }) {
  const { progress, back, edge, rowRect, size, closing, flying, revealed } = values;
  const scrimStyle = useAnimatedStyle(() => ({
    opacity: scrim * progress.get(),
  }));
  const containerStyle = useAnimatedStyle(() => {
    const { rect, radius } = frameOf(progress, back, edge, rowRect, size, rowPath);
    return {
      left: rect.x,
      top: rect.y,
      width: rect.width,
      height: rect.height,
      borderRadius: radius,
      opacity: rowPath ? (revealed.get() ? 1 : 0) : progress.get(),
    };
  });
  /** Opening, the page is what arrives; closing, what leaves. */
  const pageStyle = useAnimatedStyle(() => {
    const { rect } = frameOf(progress, back, edge, rowRect, size, rowPath);
    const p = progress.get();
    const shown = !rowPath ? 1 : closing.get() ? fadeThrough(1 - p).outgoing : fadeThrough(p).incoming;
    return {
      opacity: shown,
      transform: [{ scale: rect.width / size.get().width }, { translateY: closing.get() ? 0 : rise * (1 - shown) }],
    };
  });
  const rowStyle = useAnimatedStyle(() => {
    const { rect } = frameOf(progress, back, edge, rowRect, size, rowPath);
    const p = progress.get();
    const shown = closing.get() ? fadeThrough(1 - p).incoming : fadeThrough(p).outgoing;
    return {
      opacity: shown,
      transform: [{ scale: rect.width / rowRect.get().width }],
    };
  });
  const flightStyle = useAnimatedStyle(() => {
    if (!flight) return { opacity: 0 };
    const p = progress.get();
    const { rect } = frameOf(progress, back, edge, rowRect, size, rowPath);
    const dim = flight.read ? READ_IMAGE_OPACITY : 1;
    if (!flight.lead) {
      // No lead to go to: it rides in the row, where the row is now, and fades with it.
      const row = rowRect.get();
      const s = rect.width / row.width;
      const shown = closing.get() ? fadeThrough(1 - p).incoming : fadeThrough(p).outgoing;
      return {
        left: rect.x + (flight.thumb.x - row.x) * s,
        top: rect.y + (flight.thumb.y - row.y) * s,
        width: flight.thumb.width * s,
        height: flight.thumb.height * s,
        opacity: dim * shown,
      };
    }
    // The lead travels with the page: where it is in the page's frame now.
    const s = rect.width / size.get().width;
    const landing = closing.get()
      ? flight.lead
      : {
          x: rect.x + flight.lead.x * s,
          y: rect.y + flight.lead.y * s,
          width: flight.lead.width * s,
          height: flight.lead.height * s,
        };
    const box = lerpRect(flight.thumb, landing, p);
    return {
      left: box.x,
      top: box.y,
      width: box.width,
      height: box.height,
      opacity: dim + (1 - dim) * p,
    };
  });
  const leadStyle = useAnimatedStyle(() => ({ opacity: flying.get() ? 0 : 1 }));
  return { scrimStyle, containerStyle, pageStyle, rowStyle, flightStyle, leadStyle };
}

type TransitionProps = { id: string; articleReady: boolean; hasLead: boolean; children: ReactNode };

/**
 * The Reading view's way in and out (FEE-114, D47). Opened from a row, the row's surface grows into the
 * page, its content fading out before the page's fades in, while its thumbnail travels to the lead image.
 * Back shrinks the page into the row where it is now; Android's predictive back gesture shrinks and leans
 * it as the finger moves first. With Remove animations on (Q17), the page just appears and goes, and back
 * stays the navigator's.
 */
export function ArticleTransition(props: TransitionProps) {
  const { reduceMotion } = useEnvironment();
  return reduceMotion ? <View style={StyleSheet.absoluteFill}>{props.children}</View> : <MovingArticle {...props} />;
}

/**
 * The move's state (FEE-114): where it came from, which way it goes (`row` or the `axis`), what stage it's
 * at, the travelling picture and its hand-over to the lead, and Back. `MovingArticle` only draws it.
 */
function useContainerTransform({ id, articleReady, hasLead }: Omit<TransitionProps, 'children'>) {
  const focused = useIsFocused();
  const window = useWindowDimensions();
  const [screen, setScreen] = useState({
    width: window.width,
    height: window.height,
  });
  // Read once: the row this Article was opened from, while it's still on screen.
  const [origin] = useState<Origin | undefined>(() => {
    const found = getOrigin(id);
    return found && isOnScreen(found.row, window) ? found : undefined;
  });

  const [path, setPath] = useState<Path>(origin ? 'row' : 'axis');
  const [phase, setPhase] = useState<'waiting' | 'opening' | 'open' | 'closing'>('waiting');
  // Mounted at once, unseen over the real row's own, so it's drawn before anything covers that row.
  const [flight, setFlight] = useState<Flight | undefined>(() =>
    origin?.thumb && origin.article.imageUrl ? { thumb: origin.thumb, read: origin.article.read } : undefined,
  );
  // Whether the picture is drawn yet: a freshly mounted image takes a few frames, even from the cache.
  const [flightShown, setFlightShown] = useState(false);
  const [rowShown, setRowShown] = useState(origin);

  // How to measure the page's lead image while it's mounted (`LeadSlot`).
  const measureLead = useRef<() => Rect | undefined>(undefined);
  const registerLead = useCallback((measure: () => Rect | undefined) => {
    measureLead.current = measure;
    return () => {
      if (measureLead.current === measure) measureLead.current = undefined;
    };
  }, []);
  const pageRef = useRef<ViewRef>(null);
  const [lead, setLead] = useState<Rect | undefined>();

  // 1 is the page, 0 the row (or nothing, on the axis). `back` is how far the back gesture has gone.
  const progress = useSharedValue(0);
  const back = useSharedValue(0);
  const edge = useSharedValue<Edge>('left');
  const closing = useSharedValue(false);
  const flying = useSharedValue(false);
  const revealed = useSharedValue(false);
  const size = useSharedValue(screen);
  const rowRect = useSharedValue<Rect>(origin?.row ?? { x: 0, y: 0, ...screen });

  // Opening waits, briefly, for the page to place its lead image, so the thumbnail knows where to land.
  const leadSettled = !hasLead || lead !== undefined;
  const finishOpening = () => {
    setFlight(undefined);
    setFlightShown(false);
    setRowShown(undefined);
    setPhase('open');
  };
  // The travelling picture hands over to the lead only once it has landed and the lead is drawn: the lead
  // shows first, beneath the identical picture, and the picture goes two frames later, so there's never a
  // frame with neither. A lead that never draws (a broken image) doesn't hold the page up for long.
  const handover = useRef({ flight: false, landed: false, leadDrawn: false, done: false });
  const handOver = () => {
    if (handover.current.done) return;
    handover.current.done = true;
    flying.set(false);
    requestAnimationFrame(() => requestAnimationFrame(finishOpening));
  };
  const onLanded = () => {
    handover.current.landed = true;
    if (!handover.current.flight || handover.current.leadDrawn) handOver();
    else setTimeout(handOver, LEAD_DRAW_WAIT);
  };
  const onLeadDrawn = () => {
    handover.current.leadDrawn = true;
    if (handover.current.landed) handOver();
  };
  const startOpening = useEffectEvent(() => {
    if (flight && lead) {
      setFlight({ ...flight, lead });
      handover.current.flight = true;
    }
    revealed.set(true);
    setPhase('opening');
    progress.set(
      withTiming(
        1,
        {
          duration: path === 'row' ? duration : motion.articleAxis.duration,
          easing: EMPHASIZED,
        },
        (done) => {
          if (done) scheduleOnRN(onLanded);
        },
      ),
    );
  });
  const waiting = phase === 'waiting';
  const pageSettled = path !== 'row' || (articleReady && leadSettled);
  const ready = pageSettled && (!flight || flightShown);
  useEffect(() => {
    if (!waiting) return;
    // At once when the page is placed and the picture drawn, else never longer than this: the text matters
    // more than the thumbnail's flight (300 ms tap to text).
    const timer = setTimeout(startOpening, ready ? 0 : LEAD_WAIT);
    return () => clearTimeout(timer);
  }, [waiting, ready]);

  // The lead hides only while its picture, drawn, is travelling to or from it, so it's never missing a frame.
  useLayoutEffect(() => {
    flying.set(flight?.lead !== undefined && flightShown);
  }, [flight, flightShown, flying]);

  /** Back: into the row where it is now, else away on the axis; the navigator then drops the page at once. */
  const closeArticle = () => {
    const place = measureRow(id);
    const into = place && isOnScreen(place.row, screen) ? place : undefined;
    const leadNow = measureLead.current?.();
    // Opening marked it Read (P7), so it goes back into a Read row.
    const read = articleReady || (origin?.article.read ?? false);
    const toRow = into && origin ? { ...origin, ...into, article: { ...origin.article, read } } : undefined;
    setPath(toRow ? 'row' : 'axis');
    if (into && toRow) {
      rowRect.set(into.row);
      setRowShown(toRow);
      if (into.thumb && origin?.article.imageUrl) {
        // To the row's thumbnail from the lead when it's in view, else riding in the row as it fades in.
        setFlight({ thumb: into.thumb, lead: leadNow && isOnScreen(leadNow, screen) ? leadNow : undefined, read });
        setFlightShown(false);
      }
    }
    closing.set(true);
    setPhase('closing');
    progress.set(
      withTiming(
        0,
        {
          duration: toRow ? close : motion.articleAxis.close,
          easing: EMPHASIZED,
        },
        (done) => {
          if (done) scheduleOnRN(goBack, id);
        },
      ),
    );
  };

  useBackGesture(focused && phase === 'open', { back, edge }, closeArticle);

  const onLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setScreen({ width, height });
    size.set({ width, height });
  };
  const onLeadLayout = () => {
    const page = rectOf(pageRef.current);
    const image = measureLead.current?.();
    if (!page || !image || lead) return;
    // Where the lead lands, with the page whole: the page may still be at the row's place, slightly scaled.
    const s = screen.width / page.width;
    setLead({
      x: (image.x - page.x) * s,
      y: (image.y - page.y) * s,
      width: image.width * s,
      height: image.height * s,
    });
  };

  const rowPath = path === 'row';
  const { leadStyle, ...styles } = useMoveStyles({
    values: { progress, back, edge, rowRect, size, closing, flying, revealed },
    rowPath,
    flight,
  });

  return {
    onLayout,
    screen,
    rowPath,
    rowShown,
    flight,
    onFlightDrawn: () => setFlightShown(true),
    pageRef,
    leadSlot: { register: registerLead, laidOut: onLeadLayout, displayed: onLeadDrawn, style: leadStyle },
    styles,
  };
}

/** The page drawn at full size throughout and only clipped and scaled, so its text never reflows mid-move. */
function MovingArticle({ children, ...props }: TransitionProps) {
  const theme = themes[useEnvironment().colorScheme];
  const { onLayout, screen, rowPath, rowShown, flight, onFlightDrawn, pageRef, leadSlot, styles } =
    useContainerTransform(props);
  return (
    <View style={StyleSheet.absoluteFill} onLayout={onLayout}>
      <Animated.View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, { backgroundColor: palette.black }, styles.scrimStyle]}
      />
      <Animated.View
        style={[{ position: 'absolute', overflow: 'hidden', backgroundColor: theme.background }, styles.containerStyle]}
      >
        <Animated.View
          ref={pageRef}
          collapsable={false}
          style={[
            {
              position: 'absolute',
              left: 0,
              top: 0,
              width: screen.width,
              height: screen.height,
              transformOrigin: 'left top',
            },
            styles.pageStyle,
          ]}
        >
          <LeadSlotContext value={leadSlot}>{children}</LeadSlotContext>
        </Animated.View>
        {rowShown && rowPath ? (
          <Animated.View
            testID="opening-row"
            pointerEvents="none"
            importantForAccessibility="no-hide-descendants"
            accessibilityElementsHidden
            className={ROW_CLASS}
            style={[
              { position: 'absolute', left: 0, top: 0, width: rowShown.row.width, transformOrigin: 'left top' },
              styles.rowStyle,
            ]}
          >
            <ArticleRowContent
              article={rowShown.article}
              feedNamed={rowShown.feedNamed}
              image={flight ? 'space' : 'show'}
            />
          </Animated.View>
        ) : null}
      </Animated.View>
      {flight && rowShown?.article.imageUrl ? (
        <Animated.View pointerEvents="none" className="absolute overflow-hidden rounded-lg" style={styles.flightStyle}>
          <Image
            source={{ uri: rowShown.article.imageUrl }}
            accessible={false}
            contentFit="cover"
            recyclingKey={props.id}
            onDisplay={onFlightDrawn}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
      ) : null}
    </View>
  );
}
