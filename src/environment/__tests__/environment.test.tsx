import { act, render, screen } from '@testing-library/react-native';
import { AccessibilityInfo, AppState, Text } from 'react-native';

import { EnvironmentProvider, useEnvironment, useMinuteClock } from '@/environment';

function Probe() {
  const { reduceMotion, colorScheme, fontScale } = useEnvironment();
  return <Text>{`motion:${reduceMotion ? 'reduced' : 'full'} scheme:${colorScheme} scale:${fontScale}`}</Text>;
}

describe('the phone environment', () => {
  let emitReduceMotion: (enabled: boolean) => void;
  const remove = jest.fn();

  beforeEach(() => {
    remove.mockClear();
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
    jest.spyOn(AccessibilityInfo, 'addEventListener').mockImplementation((event, handler) => {
      if (event === 'reduceMotionChanged') emitReduceMotion = handler as (enabled: boolean) => void;
      return { remove } as never;
    });
  });

  afterEach(() => jest.restoreAllMocks());

  test('follows Android "Remove animations" at start and when it changes', async () => {
    await render(
      <EnvironmentProvider>
        <Probe />
      </EnvironmentProvider>,
    );

    expect(await screen.findByText(/motion:reduced/)).toBeOnTheScreen();

    await act(async () => emitReduceMotion(false));
    expect(screen.getByText(/motion:full/)).toBeOnTheScreen();
  });

  test('stops listening when unmounted', async () => {
    await render(
      <EnvironmentProvider>
        <Probe />
      </EnvironmentProvider>,
    );
    await screen.findByText(/motion:reduced/);

    await screen.unmount();
    expect(remove).toHaveBeenCalledTimes(1);
  });
});

test('a given environment replaces the phone', async () => {
  // The phone says full motion; the given environment says reduced, and wins.
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);

  await render(
    <EnvironmentProvider environment={{ colorScheme: 'light', reduceMotion: true, fontScale: 2, now: Date.now }}>
      <Probe />
    </EnvironmentProvider>,
  );

  expect(await screen.findByText('motion:reduced scheme:light scale:2')).toBeOnTheScreen();
  jest.restoreAllMocks();
});

describe('the minute clock (FEE-47)', () => {
  let emitAppState: (state: string) => void;
  const remove = jest.fn();
  let time = 0;

  function Clock() {
    return <Text>{`t:${useMinuteClock()}`}</Text>;
  }
  const environment = { colorScheme: 'dark' as const, reduceMotion: false, fontScale: 1, now: () => time };

  beforeEach(() => {
    jest.useFakeTimers();
    time = 0;
    remove.mockClear();
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, handler) => {
      emitAppState = handler as (state: string) => void;
      return { remove } as never;
    });
  });
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  test('reads the clock again each minute, so "5 min ago" keeps up', async () => {
    await render(
      <EnvironmentProvider environment={environment}>
        <Clock />
      </EnvironmentProvider>,
    );
    expect(screen.getByText('t:0')).toBeOnTheScreen();
    time = 60_000;
    await act(async () => jest.advanceTimersByTime(60_000));
    expect(screen.getByText('t:60000')).toBeOnTheScreen();
  });

  test('stops in the background and reads afresh on return (Q21)', async () => {
    await render(
      <EnvironmentProvider environment={environment}>
        <Clock />
      </EnvironmentProvider>,
    );
    await act(async () => emitAppState('background'));
    // Minutes pass in the background: nothing reads the clock.
    time = 5 * 60_000;
    await act(async () => jest.advanceTimersByTime(5 * 60_000));
    expect(screen.getByText('t:0')).toBeOnTheScreen();
    await act(async () => emitAppState('active'));
    expect(screen.getByText('t:300000')).toBeOnTheScreen();
  });

  test('leaves no timer or listener behind when it goes (Q20)', async () => {
    const { unmount } = await render(
      <EnvironmentProvider environment={environment}>
        <Clock />
      </EnvironmentProvider>,
    );
    const cleared = jest.spyOn(globalThis, 'clearInterval');
    await act(async () => unmount());
    expect(cleared).toHaveBeenCalled();
    expect(remove).toHaveBeenCalled();
    // Nothing reads the clock after it's gone.
    time = 60_000;
    await act(async () => jest.advanceTimersByTime(60_000));
  });
});
