import { act, render, screen } from '@testing-library/react-native';
import { AccessibilityInfo, Text } from 'react-native';

import { EnvironmentProvider, useEnvironment } from '@/environment';

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
    <EnvironmentProvider environment={{ colorScheme: 'light', reduceMotion: true, fontScale: 2 }}>
      <Probe />
    </EnvironmentProvider>,
  );

  expect(await screen.findByText('motion:reduced scheme:light scale:2')).toBeOnTheScreen();
  jest.restoreAllMocks();
});
