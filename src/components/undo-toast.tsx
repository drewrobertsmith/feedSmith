import { useIsFocused } from 'expo-router';
import { createContext, use, useEffect, useState, type ReactNode } from 'react';
import { AccessibilityInfo, View } from 'react-native';
import Animated, { Easing, FadeIn, FadeOut, ReduceMotion } from 'react-native-reanimated';

import { AppText } from '@/components/app-text';
import { DepthPressable } from '@/components/depth-pressable';
import { useEnvironment } from '@/environment';
import { depthStyle } from '@/theme/depth';
import { spacing } from '@/theme/spacing';

/** How long the toast stays: about four seconds, longer when TalkBack asks for more time. */
const SHOWN_FOR = 4000;
const ENTER = FadeIn.duration(200).easing(Easing.bezier(0.23, 1, 0.32, 1)).reduceMotion(ReduceMotion.System);
const EXIT = FadeOut.duration(150).reduceMotion(ReduceMotion.System);

type Toast = { key: number; message: string; undo?: () => void };
type Show = (message: string, undo?: () => void) => void;
type UndoState = { toast: Toast | null; dismiss: () => void };

/** The note on screen, for the hosts that draw it. */
const UndoContext = createContext<UndoState | null>(null);
/** Showing a note: never changes, so a list whose rows can show one doesn't re-render when one does. */
const ShowContext = createContext<Show | null>(null);

/**
 * Undo for reversible actions (Q35): an action happens at once, then a short note says what
 * happened, with Undo, for a few seconds. A note can also come without Undo, when there's nothing
 * to undo (a fourth Pin refused). One at a time: a new one replaces the last. It's
 * announced to TalkBack, which can ask for it to stay longer, and its timer is cleared when it
 * goes or the app does (Q20).
 */
export function UndoProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<Toast | null>(null);

  useEffect(() => {
    if (!toast) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let gone = false;
    void AccessibilityInfo.getRecommendedTimeoutMillis(SHOWN_FOR).then((ms) => {
      // Never shorter than asked for, whatever the platform answers.
      const shownFor = typeof ms === 'number' && ms > SHOWN_FOR ? ms : SHOWN_FOR;
      if (!gone) timer = setTimeout(() => setToast((now) => (now?.key === toast.key ? null : now)), shownFor);
    });
    AccessibilityInfo.announceForAccessibility(toast.undo ? `${toast.message} Undo is available.` : toast.message);
    return () => {
      gone = true;
      if (timer) clearTimeout(timer);
    };
  }, [toast]);

  const [show] = useState(() => {
    const showNote: Show = (message, undo) => setToast((last) => ({ key: (last?.key ?? 0) + 1, message, undo }));
    return showNote;
  });
  const state: UndoState = { toast, dismiss: () => setToast(null) };
  return (
    <ShowContext value={show}>
      <UndoContext value={state}>{children}</UndoContext>
    </ShowContext>
  );
}

function useUndoState(): UndoState {
  const state = use(UndoContext);
  if (!state) throw new Error('useUndo needs an <UndoProvider> above it');
  return state;
}

/** Shows what just happened, with Undo when it can be undone (Q35). */
export function useUndo(): Show {
  const show = use(ShowContext);
  if (!show) throw new Error('useUndo needs an <UndoProvider> above it');
  return show;
}

/**
 * Where a screen shows the toast: at its foot, above the tab bar, `bottom` up from the edge. Only
 * the screen in front shows it.
 */
export function UndoToastHost({ bottom = 0 }: { bottom?: number }) {
  const { toast, dismiss } = useUndoState();
  const focused = useIsFocused();
  const { colorScheme, reduceMotion } = useEnvironment();
  if (!toast || !focused) return null;
  const { undo } = toast;
  return (
    <View pointerEvents="box-none" className="absolute left-0 right-0 px-edge" style={{ bottom: bottom + spacing.group }}>
      <Animated.View
        key={toast.key}
        testID="undo-toast"
        // Remove animations (Q17) is read from the environment, as all motion here is: Reanimated's own skip
        // left a gradient face inside an entering animation invisible on Android (FEE-74).
        entering={reduceMotion ? undefined : ENTER}
        exiting={reduceMotion ? undefined : EXIT}
        accessibilityLiveRegion="polite"
        // Raised: it rests over the content (D27).
        className="flex-row items-center justify-between gap-group rounded-2xl py-related pl-group pr-related"
        style={depthStyle(colorScheme, 'raised')}
      >
        <AppText variant="label" className="shrink text-text">
          {toast.message}
        </AppText>
        {/* A soft button, as the app's other quiet actions are (Open original, D27). */}
        {undo ? (
          <DepthPressable
            level="soft"
            role="button"
            aria-label="Undo"
            onPress={() => {
              dismiss();
              undo();
            }}
            hitSlop={spacing.related}
            className="rounded-full px-group py-related"
          >
            <AppText variant="label" className="text-text" accessible={false}>
              Undo
            </AppText>
          </DepthPressable>
        ) : null}
      </Animated.View>
    </View>
  );
}
