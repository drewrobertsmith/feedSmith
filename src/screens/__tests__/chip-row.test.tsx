import { render, screen, userEvent } from '@testing-library/react-native';

import { UndoProvider } from '@/components/undo-toast';
import { EnvironmentProvider } from '@/environment';
import { FeedsContext, type FeedChip } from '@/feeds/feeds-data';
import { ChipRow } from '@/screens/chip-row';
import { worldEnvironment, worldFeeds } from '@/worlds/world';
import { depth } from '@/theme/depth';
import { PINNED } from '../../../convex/lib/pinned';

const spec = { colorScheme: 'dark', feeds: 'some' } as const;
const chip = (id: string, title: string, pinned: boolean): FeedChip => ({ id, title, pinned });

/** The row as the server's order would give it: Pinned first, in Pin order. */
const row = (pinned: string[]) =>
  [chip('f1', 'The Verge', false), chip('f2', 'Calm Notes', false), chip('f3', 'Daring Fireball', false)]
    .map((c) => ({ ...c, pinned: pinned.includes(c.id) }))
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || (b.pinned ? pinned.indexOf(a.id) - pinned.indexOf(b.id) : 0));

function Row({ chips, selected }: { chips: FeedChip[]; selected: string | null }) {
  return (
    <EnvironmentProvider environment={worldEnvironment(spec)}>
      <UndoProvider>
        <FeedsContext value={worldFeeds(spec)}>
          <ChipRow chips={chips} selected={selected} onSelect={() => {}} />
        </FeedsContext>
      </UndoProvider>
    </EnvironmentProvider>
  );
}

const names = () => screen.getAllByRole('tab').map((tab) => tab.props.accessibilityLabel);
const chosen = () => screen.getByRole('tab', { selected: true }).props.accessibilityLabel;

describe('the Pinned group follows Pins as they change (FEE-60)', () => {
  test('a new Pin joins the open group at once', async () => {
    const { rerender } = await render(<Row chips={row(['f1', 'f3'])} selected={PINNED} />);
    expect(names()).toEqual(['All', 'Pinned: The Verge, Daring Fireball', 'The Verge, Pinned', 'Daring Fireball, Pinned', 'Calm Notes']);
    await rerender(<Row chips={row(['f1', 'f3', 'f2'])} selected={PINNED} />);
    expect(names()).toEqual([
      'All',
      'Pinned: The Verge, Daring Fireball, Calm Notes',
      'The Verge, Pinned',
      'Daring Fireball, Pinned',
      'Calm Notes, Pinned',
    ]);
  });

  test('dropping below two Pins falls back to the one-Pin row, and the chosen Feed stays chosen', async () => {
    const { rerender } = await render(<Row chips={row(['f1', 'f3'])} selected="f3" />);
    expect(chosen()).toBe('Daring Fireball, Pinned');
    // Daring Fireball is unpinned while it's being read: one Pin left, so no group.
    await rerender(<Row chips={row(['f1'])} selected="f3" />);
    expect(names()).toEqual(['All', 'The Verge, Pinned', 'Calm Notes', 'Daring Fireball']);
    expect(chosen()).toBe('Daring Fireball');
  });

  test("a chosen Feed that's unpinned, with two Pins still left, stays chosen and folds the group", async () => {
    const { rerender } = await render(<Row chips={row(['f1', 'f2', 'f3'])} selected="f2" />);
    expect(screen.getByRole('tab', { name: /^Pinned:/ })).toBeExpanded();
    await rerender(<Row chips={row(['f1', 'f3'])} selected="f2" />);
    expect(names()).toEqual(['All', 'Pinned: The Verge, Daring Fireball', 'Calm Notes']);
    expect(chosen()).toBe('Calm Notes');
    expect(screen.getByRole('tab', { name: /^Pinned:/ })).toBeCollapsed();
  });
});

// FEE-85: the tray follows the Pins at once, with no state of its own.
describe('the Pinned group\'s tray follows Pins as they change (FEE-85)', () => {
  const trayHolds = () =>
    screen.queryByTestId('pinned-tray') &&
    screen.getAllByRole('tab').filter((tab) => {
      for (let node = tab.parent; node; node = node.parent) if (node.props.testID === 'pinned-tray') return true;
      return false;
    }).map((tab) => tab.props.accessibilityLabel);

  test('a new Pin joins the open tray at once, and an Unpin leaves it', async () => {
    const { rerender } = await render(<Row chips={row(['f1', 'f3'])} selected={PINNED} />);
    expect(trayHolds()).toEqual(['Pinned: The Verge, Daring Fireball', 'The Verge, Pinned', 'Daring Fireball, Pinned']);
    await rerender(<Row chips={row(['f1', 'f3', 'f2'])} selected={PINNED} />);
    expect(trayHolds()).toEqual([
      'Pinned: The Verge, Daring Fireball, Calm Notes',
      'The Verge, Pinned',
      'Daring Fireball, Pinned',
      'Calm Notes, Pinned',
    ]);
    await rerender(<Row chips={row(['f1', 'f2'])} selected={PINNED} />);
    expect(trayHolds()).toEqual(['Pinned: The Verge, Calm Notes', 'The Verge, Pinned', 'Calm Notes, Pinned']);
  });

  test('down to one Pin, the tray goes', async () => {
    const { rerender } = await render(<Row chips={row(['f1', 'f3'])} selected="f1" />);
    expect(screen.getByTestId('pinned-tray')).toBeOnTheScreen();
    await rerender(<Row chips={row(['f1'])} selected="f1" />);
    expect(screen.queryByTestId('pinned-tray')).not.toBeOnTheScreen();
  });
});

describe('the stacked icons ring in the Pinned chip\'s own face, so each stays a separate disc on it (FEE-74)', () => {
  test.each([
    ['chosen, the raised face', PINNED, depth.dark.raised.face],
    ['not chosen, the soft face', null, depth.dark.soft.face],
  ])('%s', async (_name, selected, face) => {
    await render(<Row chips={row(['f1', 'f3'])} selected={selected} />);
    for (const ring of screen.getAllByTestId('pinned-stack-ring', { includeHiddenElements: true })) expect(ring).toHaveStyle({ borderColor: face });
  });
});

// FEE-74 bug: with Android's animations off, Reanimated's own reduced-motion skip left a revealed chip with a gradient
// face invisible. Remove animations (Q17) is read from the environment like every other motion in the app: the
// group's chips then take no layout animation at all, and simply appear and disappear.
describe('with Remove animations on, the Pinned group opens and folds with no animation (Q17, D24)', () => {
  function Still({ selected }: { selected: string | null }) {
    const still = { ...spec, reduceMotion: true };
    return (
      <EnvironmentProvider environment={worldEnvironment(still)}>
        <UndoProvider>
          <FeedsContext value={worldFeeds(still)}>
            <ChipRow chips={row(['f1', 'f3'])} selected={selected} onSelect={() => {}} />
          </FeedsContext>
        </UndoProvider>
      </EnvironmentProvider>
    );
  }

  /** The layout animations on the Reanimated view that wraps a chip in the row, if any. */
  const animationsOf = (tab: ReturnType<typeof screen.getByRole>) => {
    for (let node = tab.parent; node; node = node.parent) {
      if ('layout' in node.props || 'entering' in node.props) return [node.props.entering, node.props.exiting, node.props.layout];
    }
    return [];
  };

  test('with motion on, the group\'s chips do animate (so the check below can fail)', async () => {
    await render(<Row chips={row(['f1', 'f3'])} selected={PINNED} />);
    expect(animationsOf(screen.getByRole('tab', { name: 'The Verge, Pinned' })).filter(Boolean).length).toBeGreaterThan(0);
  });

  test.each([PINNED, null])('selected %s', async (selected) => {
    await render(<Still selected={selected} />);
    for (const tab of screen.getAllByRole('tab').slice(2)) expect(animationsOf(tab).filter(Boolean)).toEqual([]);
  });

  // FEE-84: hiding and showing the group from the chosen Pinned chip are the same reveal, so just as still.
  test('hiding and showing the group from the chosen Pinned chip', async () => {
    const user = userEvent.setup();
    await render(<Still selected={PINNED} />);
    await user.press(screen.getByRole('tab', { name: /^Pinned:/ }));
    expect(names()).toEqual(['All', 'Pinned: The Verge, Daring Fireball', 'Calm Notes']);
    for (const tab of screen.getAllByRole('tab').slice(2)) expect(animationsOf(tab).filter(Boolean)).toEqual([]);
    await user.press(screen.getByRole('tab', { name: /^Pinned:/ }));
    expect(names()).toEqual(['All', 'Pinned: The Verge, Daring Fireball', 'The Verge, Pinned', 'Daring Fireball, Pinned', 'Calm Notes']);
    for (const tab of screen.getAllByRole('tab').slice(2)) expect(animationsOf(tab).filter(Boolean)).toEqual([]);
  });

  // FEE-85: the tray widens and narrows on the chips' own transition, and with Remove animations not at all.
  test('the tray takes no layout animation', async () => {
    const user = userEvent.setup();
    await render(<Still selected={PINNED} />);
    expect(screen.getByTestId('pinned-tray').props.layout).toBeUndefined();
    await user.press(screen.getByRole('tab', { name: /^Pinned:/ }));
    expect(screen.getByTestId('pinned-tray').props.layout).toBeUndefined();
  });

  test('with motion on, the tray moves on the same transition as the chips after it', async () => {
    const user = userEvent.setup();
    await render(<Row chips={row(['f1', 'f3'])} selected={PINNED} />);
    const after = () => animationsOf(screen.getByRole('tab', { name: 'Calm Notes' }))[2];
    expect(screen.getByTestId('pinned-tray').props.layout).toBe(after());
    await user.press(screen.getByRole('tab', { name: /^Pinned:/ }));
    expect(screen.getByTestId('pinned-tray').props.layout).toBe(after());
    expect(after()).toBeDefined();
  });

  test('with motion on, hiding the group does animate (so the check above can fail)', async () => {
    const user = userEvent.setup();
    await render(<Row chips={row(['f1', 'f3'])} selected={PINNED} />);
    await user.press(screen.getByRole('tab', { name: /^Pinned:/ }));
    expect(animationsOf(screen.getByRole('tab', { name: 'Calm Notes' })).filter(Boolean).length).toBeGreaterThan(0);
  });
});
