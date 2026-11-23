import { useIsFocused } from 'expo-router';
import { createContext, use, useEffect, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Pressable, View } from 'react-native';
import Animated, { Easing, FadeIn, FadeOut, ReduceMotion } from 'react-native-reanimated';

import { AppText } from '@/components/app-text';
import { spacing } from '@/theme/spacing';

/** How long the toast stays: about four seconds, longer when TalkBack asks for more time. */
const SHOWN_FOR = 4000;
const ENTER = FadeIn.duration(200).easing(Easing.bezier(0.23, 1, 0.32, 1)).reduceMotion(ReduceMotion.System);
const EXIT = FadeOut.duration(150).reduceMotion(ReduceMotion.System);

type Toast = { key: number; message: string; undo: () => void };
type UndoState = { toast: Toast | null; show: (message: string, undo: () => void) => void; dismiss: () => void };

const UndoContext = createContext<UndoState | null>(null);

/**
 * Undo for reversible actions (Q35): an action happens at once, then a short note says what
 * happened, with Undo, for a few seconds. One at a time: a new one replaces the last. It's
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
    AccessibilityInfo.announceForAccessibility(`${toast.message} Undo is available.`);
    return () => {
      gone = true;
      if (timer) clearTimeout(timer);
    };
  }, [toast]);

  const state: UndoState = {
    toast,
    show: (message, undo) => setToast((last) => ({ key: (last?.key ?? 0) + 1, message, undo })),
    dismiss: () => setToast(null),
  };
  return <UndoContext value={state}>{children}</UndoContext>;
}

function useUndoState(): UndoState {
  const state = use(UndoContext);
  if (!state) throw new Error('useUndo needs an <UndoProvider> above it');
  return state;
}

/** Shows what just happened, with Undo (Q35). */
export function useUndo(): UndoState['show'] {
  return useUndoState().show;
}

/**
 * Where a screen shows the toast: at its foot, above the tab bar, `bottom` up from the edge. Only
 * the screen in front shows it.
 */
export function UndoToastHost({ bottom = 0 }: { bottom?: number }) {
  const { toast, dismiss } = useUndoState();
  const focused = useIsFocused();
  if (!toast || !focused) return null;
  const undo = () => {
    dismiss();
    toast.undo();
  };
  return (
    <View pointerEvents="box-none" className="absolute left-0 right-0 px-edge" style={{ bottom: bottom + spacing.group }}>
      <Animated.View
        key={toast.key}
        testID="undo-toast"
        entering={ENTER}
        exiting={EXIT}
        accessibilityLiveRegion="polite"
        className="flex-row items-center justify-between gap-group rounded-2xl bg-surface py-related pl-group pr-related"
      >
        <AppText variant="label" className="shrink text-text">
          {toast.message}
        </AppText>
        {/* An outlined button, as the app's other quiet actions are (Open original). */}
        <Pressable
          role="button"
          aria-label="Undo"
          onPress={undo}
          hitSlop={spacing.related}
          className="rounded-full border border-text-muted px-group py-related"
        >
          <AppText variant="label" className="text-text" accessible={false}>
            Undo
          </AppText>
        </Pressable>
      </Animated.View>
    </View>
  );
}
