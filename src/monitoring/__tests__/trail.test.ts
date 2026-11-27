import * as Sentry from '@sentry/react-native';

import { trail } from '@/monitoring/trail';

jest.mock('@sentry/react-native', () => ({ addBreadcrumb: jest.fn() }));

const addBreadcrumb = jest.mocked(Sentry.addBreadcrumb);

function sent() {
  expect(addBreadcrumb).toHaveBeenCalledTimes(1);
  return addBreadcrumb.mock.calls[0][0];
}

beforeEach(() => addBreadcrumb.mockClear());

// FEE-137 (T50, Q12): the User's last actions reach a crash report as ids and outcomes, nothing else.
describe('trail', () => {
  test('adds a breadcrumb in feedSmith’s category, naming the action and its ids', () => {
    trail('article.opened', { articleId: 'k57abc123', feedId: 'j9xyz' });
    expect(sent()).toEqual({
      category: 'feedsmith',
      message: 'article.opened',
      level: 'info',
      data: { articleId: 'k57abc123', feedId: 'j9xyz' },
    });
  });

  test('keeps an outcome and a count', () => {
    trail('feeds.refreshed', { outcome: 'failed', count: 3 });
    expect(sent().data).toEqual({ outcome: 'failed', count: 3 });
  });

  test('an action with no details still leaves its breadcrumb', () => {
    trail('feed.try-again');
    expect(sent()).toMatchObject({ message: 'feed.try-again', data: {} });
  });

  // Abuse cases: a later change passing the wrong thing can't leak what the User reads (Q9).
  test.each([
    ['a URL', 'https://example.com/feed.xml'],
    ['a feed scheme', 'feed://example.com/rss'],
    ['a bare host', 'example.com'],
    ['a title', 'How the Web Was Won'],
    ['an empty string', ''],
  ])('drops %s passed as an id', (_, value) => {
    trail('article.prefetched', { articleId: value, feedId: 'j9xyz' });
    expect(sent().data).toEqual({ feedId: 'j9xyz' });
  });

  test('drops a key that isn’t an id, an outcome or a count', () => {
    trail('feed.added', { feedId: 'j9xyz', url: 'k57abc', title: 'abc' } as never);
    expect(sent().data).toEqual({ feedId: 'j9xyz' });
  });
});
