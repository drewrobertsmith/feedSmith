import { reachTop, update, type NewArticles } from '@/feeds/new-articles';

/** A list on screen in All, scrolled down, nothing waiting. */
const shown = (ids: string[], view = 'all'): NewArticles => update(update(null, view, [], false), view, ids, false);

describe('what counts as new Articles (FEE-102)', () => {
  test('an Article not shown before, while scrolled down, is waiting at the top', () => {
    expect(update(shown(['a1', 'a2']), 'all', ['n1', 'a1', 'a2'], false).waiting).toBe(true);
  });

  test('at the top, nothing waits: the new rows are in view', () => {
    expect(update(shown(['a1', 'a2']), 'all', ['n1', 'a1', 'a2'], true).waiting).toBe(false);
  });

  test('a first load, with nothing on screen yet, counts nothing', () => {
    expect(update(null, 'all', ['a1', 'a2'], false).waiting).toBe(false);
    expect(update(update(null, 'all', [], false), 'all', ['a1', 'a2'], false).waiting).toBe(false);
  });

  test("replacing a list already on screen (a resume's update) counts its new Articles", () => {
    expect(update(shown(['old1', 'old2']), 'all', ['new1', 'old1', 'old2'], false).waiting).toBe(true);
  });

  test("switching chips counts nothing: another chip's Articles are a new list", () => {
    expect(update(shown(['a1', 'a2'], 'all'), 'f2', ['c1', 'c2'], false).waiting).toBe(false);
  });

  test('a chip switch forgets what was waiting', () => {
    const waiting = update(shown(['a1']), 'all', ['n1', 'a1'], false);
    expect(update(waiting, 'f1', ['a1'], false).waiting).toBe(false);
  });

  test('rows that only changed (Read, a new title) count nothing', () => {
    expect(update(shown(['a1', 'a2']), 'all', ['a1', 'a2'], false).waiting).toBe(false);
  });

  test('fewer Articles (one cleaned up or removed) count nothing', () => {
    expect(update(shown(['a1', 'a2']), 'all', ['a1'], false).waiting).toBe(false);
  });

  test('more arrivals while scrolled keep the one note waiting', () => {
    const once = update(shown(['a1']), 'all', ['n1', 'a1'], false);
    const twice = update(once, 'all', ['n2', 'n1', 'a1'], false);
    expect(twice.waiting).toBe(true);
    // And an update with nothing new doesn't clear it.
    expect(update(twice, 'all', ['n2', 'n1', 'a1'], false).waiting).toBe(true);
  });

  test('reaching the top clears it, and what arrived is no longer new', () => {
    const waiting = update(shown(['a1']), 'all', ['n1', 'a1'], false);
    const top = reachTop(waiting);
    expect(top.waiting).toBe(false);
    expect(update(top, 'all', ['n1', 'a1'], false).waiting).toBe(false);
  });

  test('the state holds no number to show: only whether something is waiting (P7)', () => {
    const waiting = update(shown(['a1']), 'all', ['n1', 'n2', 'a1'], false);
    expect(Object.values(waiting).filter((value) => typeof value === 'number')).toEqual([]);
  });
});

describe('which Articles arrive in view, at the top (FEE-104)', () => {
  test('at the top, the new Articles are the ones arriving, newest first as listed', () => {
    expect(update(shown(['a1', 'a2']), 'all', ['n1', 'n2', 'a1', 'a2'], true).arrived).toEqual(['n1', 'n2']);
  });

  test('scrolled down, nothing arrives in view: they wait above, with the note', () => {
    expect(update(shown(['a1']), 'all', ['n1', 'a1'], false).arrived).toEqual([]);
  });

  test('a first load, a chip switch and a change to existing rows bring nothing in', () => {
    expect(update(null, 'all', ['a1'], true).arrived).toEqual([]);
    expect(update(update(null, 'all', [], true), 'all', ['a1'], true).arrived).toEqual([]);
    expect(update(shown(['a1']), 'f2', ['c1'], true).arrived).toEqual([]);
    expect(update(shown(['a1']), 'all', ['a1'], true).arrived).toEqual([]);
  });

  test('the next update forgets what last arrived', () => {
    const arrived = update(shown(['a1']), 'all', ['n1', 'a1'], true);
    expect(update(arrived, 'all', ['n1', 'a1'], true).arrived).toEqual([]);
  });
});
