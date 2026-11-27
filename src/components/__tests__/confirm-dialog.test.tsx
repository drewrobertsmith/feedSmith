import { render } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { EnvironmentProvider } from '@/environment';
import { themes, type ThemeName } from '@/theme/tokens';
import { worldEnvironment } from '@/worlds/world';

// The real dialog, not the setup's stand-in: Compose has no Jest renderer, so Expo UI's pieces record their props.
jest.unmock('@/components/confirm-dialog');
const drawn: { name: string; props: Record<string, unknown> }[] = [];
jest.mock('@expo/ui', () => ({ Host: ({ children }: { children: ReactNode }) => children }));
jest.mock('@expo/ui/jetpack-compose', () => {
  const piece =
    (name: string) =>
    ({ children, ...props }: { children?: ReactNode }) => {
      drawn.push({ name, props });
      return children ?? null;
    };
  const AlertDialog = Object.assign(piece('AlertDialog'), {
    Title: piece('Title'),
    Text: piece('Text'),
    ConfirmButton: piece('ConfirmButton'),
    DismissButton: piece('DismissButton'),
  });
  // Compose's Text holds strings natively; here it only records them.
  const Text = ({ children }: { children: ReactNode }) => {
    drawn.push({ name: 'ComposeText', props: { children } });
    return null;
  };
  return { AlertDialog, TextButton: piece('TextButton'), Text };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { ConfirmDialog } = require('@/components/confirm-dialog') as typeof import('@/components/confirm-dialog');

beforeEach(() => {
  drawn.length = 0;
});

const draw = (colorScheme: ThemeName, open = true) =>
  render(
    <EnvironmentProvider environment={worldEnvironment({ colorScheme })}>
      <ConfirmDialog open={open} title="Remove The Verge?" message="Its Articles go too." confirmLabel="Remove" onConfirm={() => {}} onCancel={() => {}} />
    </EnvironmentProvider>,
  );

test.each(['dark', 'light'] as const)('%s: theme colours only, the confirming button in brick (Q19, Q30, D19)', async (colorScheme) => {
  const theme = themes[colorScheme];
  await draw(colorScheme);
  const dialog = drawn.find((piece) => piece.name === 'AlertDialog')!;
  expect(dialog.props.colors).toEqual({ containerColor: theme.surface, titleContentColor: theme.text, textContentColor: theme.textMuted });
  const buttons = drawn.filter((piece) => piece.name === 'TextButton').map((piece) => piece.props.colors);
  // Cancel first (the dismiss slot), then the confirming one.
  expect(buttons).toEqual([{ contentColor: theme.text }, { contentColor: theme.destructive }]);
});

test('closed, it draws nothing', async () => {
  await draw('dark', false);
  expect(drawn).toEqual([]);
});
