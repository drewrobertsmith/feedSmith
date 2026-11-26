import { Image } from 'expo-image';
import { router, useIsFocused } from 'expo-router';
import { useCallback, useEffect, useEffectEvent, useRef, useState, type ReactNode } from 'react';
import { StyleSheet, useWindowDimensions, View, type LayoutChangeEvent } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, type SharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { ArticleRowContent, READ_IMAGE_OPACITY, ROW_CLASS, rectOf, type ViewRef } from '@/components/article-row';
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
import { LeadSlotContext } from '@/screens/reading/lead-slot';
import { motion } from '@/theme/motion';
import { palette, themes } from '@/theme/tokens';

const { duration, close, easing, rise, scrim } = motion.articleOpen;
const EMPHASIZED = Easing.bezier(...easing);
/** How long opening waits for the page to lay out its lead image before it goes without it (FEE-114). */
const LEAD_WAIT = 120;

/**
 * How the page comes and goes (FEE-114): `row` grows from the tapped row and shrinks back into it,
 * Material's container transform; `axis` fades from and to slightly smaller, Material's shared axis Z, with
 * no row to use; `cut` just appears and goes, with Remove animations on (Q17).
 */
type Path = 'row' | 'axis' | 'cut';
/** The thumbnail travelling between the row and the lead image, when both are there. */
type Flight = { thumb: Rect; lead: Rect; read: boolean };

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
 * The Reading view's way in and out (FEE-114, D47). Opened from a row, the row's surface grows into the
 * page, its content fading out before the page's fades in, while its thumbnail travels to the lead image.
 * Back shrinks the page into the row where it is now; Android's predictive back gesture shrinks and leans
 * it as the finger moves first. The page is drawn at full size throughout and only clipped and scaled, so
 * its text never reflows mid-move.
 */
export function ArticleTransition({
  id,
  articleReady,
  hasLead,
  children,
}: {
  id: string;
  articleReady: boolean;
  hasLead: boolean;
  children: ReactNode;
}) {
  const { reduceMotion, colorScheme } = useEnvironment();
  const theme = themes[colorScheme];
  const focused = useIsFocused();
  const window = useWindowDimensions();
  const [screen, setScreen] = useState({
    width: window.width,
    height: window.height,
  });
  // Read once: the row this Article was opened from, while it's still on screen.
  const [origin] = useState<Origin | undefined>(() => {
    const found = reduceMotion ? undefined : getOrigin(id);
    return found && isOnScreen(found.row, window) ? found : undefined;
  });

  const [path, setPath] = useState<Path>(reduceMotion ? 'cut' : origin ? 'row' : 'axis');
  const [phase, setPhase] = useState<'waiting' | 'opening' | 'open' | 'closing'>(reduceMotion ? 'open' : 'waiting');
  const [flight, setFlight] = useState<Flight | undefined>();
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
  const progress = useSharedValue(phase === 'open' ? 1 : 0);
  const back = useSharedValue(0);
  const edge = useSharedValue<Edge>('left');
  const closing = useSharedValue(false);
  const flying = useSharedValue(false);
  const size = useSharedValue(screen);
  const rowRect = useSharedValue<Rect>(origin?.row ?? { x: 0, y: 0, ...screen });

  // Opening waits, briefly, for the page to place its lead image, so the thumbnail knows where to land.
  const leadSettled = !hasLead || lead !== undefined;
  const finishOpening = () => {
    flying.set(false);
    setFlight(undefined);
    setRowShown(undefined);
    setPhase('open');
  };
  const startOpening = useEffectEvent(() => {
    if (path === 'row' && origin?.thumb && lead) {
      setFlight({ thumb: origin.thumb, lead, read: origin.article.read });
      flying.set(true);
    }
    setPhase('opening');
    progress.set(
      withTiming(
        1,
        {
          duration: path === 'row' ? duration : motion.articleAxis.duration,
          easing: EMPHASIZED,
        },
        (done) => {
          if (done) scheduleOnRN(finishOpening);
        },
      ),
    );
  });
  const waiting = phase === 'waiting';
  const pageSettled = path !== 'row' || (articleReady && leadSettled);
  useEffect(() => {
    if (!waiting) return;
    // At once when the page is placed, else never longer than this: the text matters more than the
    // thumbnail's flight (300 ms tap to text).
    const timer = setTimeout(startOpening, pageSettled ? 0 : LEAD_WAIT);
    return () => clearTimeout(timer);
  }, [waiting, pageSettled]);

  /** Back: into the row where it is now, else away on the axis; the navigator then drops the page at once. */
  const closeArticle = () => {
    if (path === 'cut') return goBack(id);
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
      if (into.thumb && leadNow && isOnScreen(leadNow, screen)) {
        setFlight({ thumb: into.thumb, lead: leadNow, read });
        flying.set(true);
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

  usePredictiveBack(focused && phase === 'open' && path !== 'cut', (event: BackEvent) => {
    if (event.type === 'started') {
      edge.set(event.edge);
      back.set(event.progress);
    } else if (event.type === 'progress') back.set(event.progress);
    else if (event.type === 'cancelled') back.set(withSpring(0, motion.predictiveBack.cancel));
    else closeArticle();
  });

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
      opacity: rowPath ? 1 : progress.get(),
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
      opacity: flight.read ? READ_IMAGE_OPACITY + (1 - READ_IMAGE_OPACITY) * p : 1,
    };
  });
  const leadStyle = useAnimatedStyle(() => ({ opacity: flying.get() ? 0 : 1 }));

  return (
    <View style={StyleSheet.absoluteFill} onLayout={onLayout}>
      {path === 'cut' ? null : (
        <Animated.View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, { backgroundColor: palette.black }, scrimStyle]}
        />
      )}
      <Animated.View
        style={[
          {
            position: 'absolute',
            overflow: 'hidden',
            backgroundColor: theme.background,
          },
          containerStyle,
        ]}
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
            pageStyle,
          ]}
        >
          <LeadSlotContext value={{ register: registerLead, laidOut: onLeadLayout, style: leadStyle }}>
            {children}
          </LeadSlotContext>
        </Animated.View>
        {rowShown && rowPath ? (
          <Animated.View
            testID="opening-row"
            pointerEvents="none"
            importantForAccessibility="no-hide-descendants"
            accessibilityElementsHidden
            className={ROW_CLASS}
            style={[
              {
                position: 'absolute',
                left: 0,
                top: 0,
                width: rowShown.row.width,
                transformOrigin: 'left top',
              },
              rowStyle,
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
        <Animated.View pointerEvents="none" className="absolute overflow-hidden rounded-lg" style={flightStyle}>
          <Image
            source={{ uri: rowShown.article.imageUrl }}
            accessible={false}
            contentFit="cover"
            recyclingKey={id}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
      ) : null}
    </View>
  );
}
