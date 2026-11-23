import { AndroidHaptics, performAndroidHapticsAsync } from 'expo-haptics';

/**
 * The phone's own haptics (Q18), Android's named effects so they feel like the system's. Never
 * the only feedback: each goes with a change on screen. Best-effort: a phone without them, or
 * with them off, just stays still.
 */

/** Save or Done went through: from a button or TalkBack (Q18). */
export function confirmHaptic() {
  void performAndroidHapticsAsync(AndroidHaptics.Confirm).catch(() => undefined);
}

/** A swipe crossed the point where letting go commits it, or came back from it. */
export function thresholdHaptic() {
  void performAndroidHapticsAsync(AndroidHaptics.Segment_Tick).catch(() => undefined);
}
