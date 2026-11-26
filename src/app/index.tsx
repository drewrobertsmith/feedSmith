import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';

import { usePlaceKeeper } from '@/navigation/place-context';
import { FeedsScreen } from '@/screens/feeds-screen';

/**
 * Feeds, with the chosen chip from the link (`?feed=`); the screen checks it's one of the User's (Q25). Opened from
 * the launcher, it starts where you left it (FEE-130): the chip, from the first frame, until the link carries it;
 * the list's place; and the Article you were reading, opened again over Feeds.
 */
export default function FeedsRoute() {
  const params = useLocalSearchParams<{ feed?: string }>();
  const feed = typeof params.feed === 'string' ? params.feed : undefined;
  const keeper = usePlaceKeeper();
  const [restoredFeed, setRestoredFeed] = useState(() => keeper.restored?.feed);
  const [startAtOffset] = useState(() => keeper.restored?.listOffset || undefined);
  // Once the link carries the restored chip, it's an ordinary choice: picking All then means All.
  if (restoredFeed !== undefined && feed === restoredFeed) setRestoredFeed(undefined);
  // The hook's router, not the global one: it queues navigation from this first effect, before the root binds.
  const router = useRouter();
  useEffect(() => {
    if (restoredFeed !== undefined && feed === undefined) router.setParams({ feed: restoredFeed });
  }, [router, restoredFeed, feed]);
  useEffect(() => {
    const article = keeper.takeRestoredArticle();
    if (article) router.push(`/article/${article}`);
  }, [router, keeper]);
  return <FeedsScreen feed={feed ?? restoredFeed} startAtOffset={startAtOffset} />;
}
