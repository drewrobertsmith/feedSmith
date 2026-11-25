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
      <AppText variant="title">Feeds</AppText>
    </EnvironmentProvider>,
  );

  expect(screen.getByRole('heading', { name: 'Feeds' })).toBeOnTheScreen();
});

test("an Article's own words are set in Literata, in real cuts; the app's in Instrument Sans (D6)", async () => {
  await render(
    <EnvironmentProvider environment={env(1)}>
      <AppText variant="headline">The headline</AppText>
      <AppText variant="deck">The Subtitle</AppText>
      <AppText variant="subhead">A subhead</AppText>
    </EnvironmentProvider>,
  );

  expect(screen.getByText('The headline')).toHaveStyle({ fontFamily: 'Literata', fontWeight: '600', fontSize: 30, lineHeight: 38 });
  expect(screen.getByText('The Subtitle')).toHaveStyle({ fontFamily: 'Literata', fontWeight: '400', fontSize: 20, lineHeight: 30 });
  expect(screen.getByText('A subhead')).toHaveStyle({ fontFamily: 'Literata', fontWeight: '600', fontSize: 22, lineHeight: 30 });
});

test("an Article's headline and subheads are headings to TalkBack; its Subtitle isn't (Q15)", async () => {
  await render(
    <EnvironmentProvider environment={env(1)}>
      <AppText variant="headline">The headline</AppText>
      <AppText variant="deck">The Subtitle</AppText>
      <AppText variant="subhead">A subhead</AppText>
    </EnvironmentProvider>,
  );

  expect(screen.getByRole('heading', { name: 'The headline' })).toBeOnTheScreen();
  expect(screen.getByRole('heading', { name: 'A subhead' })).toBeOnTheScreen();
  expect(screen.queryByRole('heading', { name: 'The Subtitle' })).not.toBeOnTheScreen();
});
