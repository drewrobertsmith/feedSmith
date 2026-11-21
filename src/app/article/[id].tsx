import { useLocalSearchParams } from 'expo-router';

import { ArticleMissing, ReadingScreen } from '@/screens/reading/reading-screen';

/** An Article id is short, lowercase letters and digits; anything else from a link is refused (Q25). */
const ARTICLE_ID = /^[a-z0-9]{1,64}$/;

export default function ArticleRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return typeof id === 'string' && ARTICLE_ID.test(id) ? <ReadingScreen id={id} /> : <ArticleMissing />;
}
