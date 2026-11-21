import { render, screen } from '@testing-library/react-native';

import { AppText } from '@/components/app-text';
import { EnvironmentProvider, type Environment } from '@/environment';

const env = (fontScale: number): Environment => ({ colorScheme: 'dark', reduceMotion: false, fontScale, now: Date.now });

test('sets each variant in its typeface, never Roboto', async () => {
  await render(
    <EnvironmentProvider environment={env(1)}>
      <AppText variant="title">Feeds</AppText>
      <AppText variant="reading">Articles from your Feeds will appear here.</AppText>
    </EnvironmentProvider>,
  );

  expect(screen.getByText('Feeds')).toHaveStyle({ fontFamily: 'InstrumentSans', fontSize: 24 });
  expect(screen.getByText(/appear here/)).toHaveStyle({ fontFamily: 'Literata', fontSize: 19 });
});

test('scales size and line height with the environment', async () => {
  await render(
    <EnvironmentProvider environment={env(2)}>
      <AppText variant="title">Feeds</AppText>
    </EnvironmentProvider>,
  );

  expect(screen.getByText('Feeds')).toHaveStyle({ fontSize: 48, lineHeight: 60 });
});

test('headings are announced as headings', async () => {
  await render(
    <EnvironmentProvider environment={env(1)}>
      <AppText variant="title">Saved</AppText>
    </EnvironmentProvider>,
  );

  expect(screen.getByRole('heading', { name: 'Saved' })).toBeOnTheScreen();
});
