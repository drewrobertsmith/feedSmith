import { render, screen } from '@testing-library/react-native';

import Index from '@/app/index';

test('home screen renders', async () => {
  await render(<Index />);

  expect(screen.getByText('Edit src/app/index.tsx to edit this screen.')).toBeOnTheScreen();
});
