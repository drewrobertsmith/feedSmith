import { AppState } from 'react-native';

import { createPlaceKeeper, memoryPlaceStore, parsePlace, type Place } from '@/navigation/place';

const PLACE: Place = { feed: 'f1', article: 'a1', listOffset: 640, articleOffset: 1200 };

describe('what comes back from the phone is untrusted (Q25)', () => {
  test('a place it wrote comes back whole', () => {
    expect(parsePlace(JSON.stringify(PLACE))).toEqual(PLACE);
  });

  test.each([
    ['nothing stored', null],
    ['not JSON', '{oops'],
    ['not an object', '"/article/a1"'],
    ['an array', '[1,2]'],
  ])('%s is no place at all', (_label, raw) => {
    expect(parsePlace(raw)).toBeNull();
  });

  test('an Article id that isn’t one is dropped, so Feeds opens instead', () => {
    expect(parsePlace(JSON.stringify({ ...PLACE, article: '../sign-in' }))?.article).toBeUndefined();
  });

  test('a chip that isn’t a plain id is dropped, so All opens', () => {
    expect(parsePlace(JSON.stringify({ ...PLACE, feed: 'x'.repeat(500) }))?.feed).toBeUndefined();
  });

  test('offsets that aren’t sane numbers start at the top', () => {
    const place = parsePlace(JSON.stringify({ ...PLACE, listOffset: -5, articleOffset: 'far' }));
    expect(place).toMatchObject({ listOffset: 0, articleOffset: 0 });
  });
});

describe('the place keeper', () => {
  let emitAppState: (state: string) => void;
  const remove = jest.fn();
  beforeEach(() => {
    remove.mockClear();
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, handler) => {
      emitAppState = handler as (state: string) => void;
      return { remove } as never;
    });
  });
  afterEach(() => jest.restoreAllMocks());

  test('reads the place once, at start', () => {
    const store = memoryPlaceStore(JSON.stringify(PLACE));
    expect(createPlaceKeeper(store).restored).toEqual(PLACE);
  });

  test('writes nothing while you scroll; writes once, when the app leaves the screen (Q21)', () => {
    const store = memoryPlaceStore();
    const keeper = createPlaceKeeper(store);
    const stop = keeper.start();
    for (let y = 0; y < 100; y++) keeper.update({ listOffset: y });
    keeper.update({ feed: 'f2' });
    expect(store.writes).toBe(0);
    emitAppState('background');
    expect(store.writes).toBe(1);
    expect(parsePlace(store.read())).toEqual({ feed: 'f2', listOffset: 99, articleOffset: 0 });
    stop();
    expect(remove).toHaveBeenCalledTimes(1);
  });

  test('leaving an Article forgets it and its offset', () => {
    const store = memoryPlaceStore();
    const keeper = createPlaceKeeper(store);
    keeper.start();
    keeper.update({ article: 'a1', articleOffset: 300 });
    keeper.update({ article: undefined, articleOffset: 0 });
    emitAppState('background');
    expect(parsePlace(store.read())?.article).toBeUndefined();
  });
});
