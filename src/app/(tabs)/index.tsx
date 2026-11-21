import { useLocalSearchParams } from 'expo-router';

import { FeedsScreen } from '@/screens/feeds-screen';

/** Feeds, with the chosen chip from the link (`?feed=`); the screen checks it's one of the User's (Q25). */
export default function FeedsRoute() {
  const { feed } = useLocalSearchParams<{ feed?: string }>();
  return <FeedsScreen feed={typeof feed === 'string' ? feed : undefined} />;
}
