import { fireEvent, render, screen } from '@testing-library/react-native';

import { AppText } from '@/components/app-text';
import { DepthPressable } from '@/components/depth-pressable';
import { EnvironmentProvider } from '@/environment';
import { depthStyle } from '@/theme/depth';
import { worldEnvironment } from '@/worlds/world';

const press = async (colorScheme: 'dark' | 'light') =>
  render(
    <EnvironmentProvider environment={worldEnvironment({ colorScheme })}>
      <DepthPressable level="soft" role="button" aria-label="Go" onPress={() => {}}>
        <AppText variant="label">Go</AppText>
      </DepthPressable>
    </EnvironmentProvider>,
  );

// The ripple (D29) is Android-only, so Jest, which renders as iOS, can't see it: its colour is pinned in the
// theme's tests (`rippleColor`) and it's checked on the emulator.
test('a press also sinks the control to pressed, and letting go raises it again', async () => {
  await press('dark');
  await fireEvent(screen.getByRole('button', { name: 'Go' }), 'pressIn');
  expect(screen.getByRole('button', { name: 'Go' })).toHaveStyle(depthStyle('dark', 'pressed'));
  await fireEvent(screen.getByRole('button', { name: 'Go' }), 'pressOut');
  expect(screen.getByRole('button', { name: 'Go' })).toHaveStyle(depthStyle('dark', 'soft'));
});
