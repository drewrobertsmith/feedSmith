import * as fixtures from '@/worlds/fixtures';

/** Every image a fixture shows: Feed icons, Article images and images in an Article's text. */
function images(value: unknown, found: string[] = []): string[] {
  if (Array.isArray(value)) value.forEach((item) => images(item, found));
  else if (value && typeof value === 'object') {
    for (const [key, field] of Object.entries(value)) {
      if (['faviconUrl', 'imageUrl', 'src'].includes(key) && typeof field === 'string') found.push(field);
      else images(field, found);
    }
  }
  return found;
}

test('the fixtures show images, so the gallery draws real rows and pages', () => {
  expect(images(fixtures).length).toBeGreaterThan(10);
});

test('no fixture image comes over the network, so two visual checks in a row match (FEE-70)', () => {
  expect(images(fixtures).filter((url) => !url.startsWith('data:image/'))).toEqual([]);
});
