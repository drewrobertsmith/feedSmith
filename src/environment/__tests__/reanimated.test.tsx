import { render, screen } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';
import Animated, { getAnimatedStyle as untypedGetAnimatedStyle, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import type { getAnimatedStyle as GetAnimatedStyle } from 'react-native-reanimated/lib/typescript/jestUtils/index.native';

// The real one, as Reanimated's native typings describe it (`setUpTests` fills it in).
const getAnimatedStyle = untypedGetAnimatedStyle as unknown as typeof GetAnimatedStyle;

/**
 * Reanimated runs for real under Jest (FEE-33): animations advance with Jest's fake timers, worklets
 * can be called directly, and Expo Router's test renderer doesn't swap it for a mock.
 */

/** A worklet: the kind of pure release physics a swipe uses (FEE-30). */
function settlesTo(offset: number, width: number): number {
  'worklet';
  return Math.abs(offset) > width / 2 ? Math.sign(offset) * width : 0;
}

function Fade({ to }: { to: number }) {
  const opacity = useSharedValue(0);
  opacity.value = withTiming(to, { duration: 200 });
  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return <Animated.View testID="fade" style={style} />;
}

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

test('an animated style moves with fake timers, part-way and to the end', async () => {
  await render(<Fade to={1} />);
  jest.advanceTimersByTime(100);
  const halfway = (getAnimatedStyle(screen.getByTestId('fade')) as { opacity: number }).opacity;
  expect(halfway).toBeGreaterThan(0);
  expect(halfway).toBeLessThan(1);
  jest.advanceTimersByTime(200);
  expect(screen.getByTestId('fade')).toHaveAnimatedStyle({ opacity: 1 });
});

test('a worklet is an ordinary function in Jest', () => {
  expect(settlesTo(70, 100)).toBe(100);
  expect(settlesTo(-70, 100)).toBe(-100);
  expect(settlesTo(30, 100)).toBe(0);
});

test("inside Expo Router's test renderer, Reanimated is the real one", async () => {
  const real = jest.requireActual('react-native-reanimated');
  const used = require('react-native-reanimated');
  expect(used.useAnimatedStyle).toBe(real.useAnimatedStyle);
  await renderRouter({ index: () => <Fade to={1} /> }, { initialUrl: '/' });
  jest.advanceTimersByTime(300);
  expect(screen.getByTestId('fade')).toHaveAnimatedStyle({ opacity: 1 });
});
