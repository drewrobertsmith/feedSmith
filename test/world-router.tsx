import { act, fireEvent } from '@testing-library/react-native';
import { renderRouter, screen } from 'expo-router/testing-library';

import FeedsRoute from '@/app/index';
import ArticleRoute from '@/app/article/[id]';
import AuthReturnRoute from '@/app/auth';
import GalleryRoute from '@/app/gallery';
import SignInRoute from '@/app/sign-in';
import { AppRoot } from '@/navigation/app-root';
import type { World } from '@/worlds/world';

/** Renders the whole app, every route, in a world. */
export function renderWorld(world: World, initialUrl: string = world.initialUrl) {
  return renderRouter(
    {
      _layout: () => <AppRoot environment={world.environment} auth={world.auth} feeds={world.feeds} />,
      index: FeedsRoute,
      'article/[id]': ArticleRoute,
      'sign-in': SignInRoute,
      auth: AuthReturnRoute,
      gallery: GalleryRoute,
    },
    { initialUrl },
  );
}

/**
 * Legend List shows its rows once its scroll view and each row report a size, as they do at
 * once on a phone; Jest has no layout, so the test reports them.
 */
export async function layOutList(testID: string) {
  const list = screen.queryByTestId(testID);
  if (!list) return;
  const layout = (height: number) => ({ nativeEvent: { layout: { x: 0, y: 0, width: 412, height } } });
  await act(async () => fireEvent(list, 'layout', layout(915)));
  for (const row of screen.queryAllByRole('link')) {
    let node = row.parent;
    while (node && !node.props.onLayout) node = node.parent;
    if (node) await act(async () => fireEvent(node!, 'layout', layout(112)));
  }
}
