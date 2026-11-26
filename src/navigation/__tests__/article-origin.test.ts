import { clearOrigin, getOrigin, measureRow, recordOrigin, registerRow } from '@/navigation/article-origin';
import { FIXTURE_ROWS } from '@/worlds/fixtures';

const [article] = FIXTURE_ROWS;
const row = { x: 0, y: 300, width: 400, height: 120 };
const thumb = { x: 312, y: 316, width: 72, height: 72 };

afterEach(() => clearOrigin(article.id));

// FEE-114: the Reading view grows from the row that was tapped and goes back into it.
describe('where an Article was opened from (FEE-114)', () => {
  test('a tapped row is remembered with its place, its thumbnail and what it showed', () => {
    const unregister = registerRow(article.id, () => ({ row, thumb }));
    recordOrigin(article, true);
    expect(getOrigin(article.id)).toEqual({
      row,
      thumb,
      article,
      feedNamed: true,
    });
    unregister();
  });

  test('a row that isn’t laid out leaves no origin, so the page opens without growing from it', () => {
    const unregister = registerRow(article.id, () => undefined);
    recordOrigin(article, true);
    expect(getOrigin(article.id)).toBeUndefined();
    unregister();
  });

  test('closing the Article forgets it, and the next tap replaces it, so at most one is kept (Q20)', () => {
    const [, other] = FIXTURE_ROWS;
    const unregisters = [registerRow(article.id, () => ({ row })), registerRow(other.id, () => ({ row }))];
    recordOrigin(article, true);
    clearOrigin(article.id);
    expect(getOrigin(article.id)).toBeUndefined();
    recordOrigin(article, true);
    recordOrigin(other, true);
    expect(getOrigin(article.id)).toBeUndefined();
    expect(getOrigin(other.id)?.article).toBe(other);
    unregisters.forEach((unregister) => unregister());
  });

  test('going back measures the row again, where it is now', () => {
    let y = 300;
    const unregister = registerRow(article.id, () => ({ row: { ...row, y } }));
    y = 420;
    expect(measureRow(article.id)?.row.y).toBe(420);
    unregister();
  });

  test('a row that has gone (scrolled out of the list, or removed) can’t be measured', () => {
    const unregister = registerRow(article.id, () => ({ row }));
    unregister();
    expect(measureRow(article.id)).toBeUndefined();
  });
});
