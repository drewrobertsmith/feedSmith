import { notUpdatingReason } from '@/screens/not-updating-reason';
import type { FetchFailure } from '../../../convex/lib/feed/validators';

// Every reason a fetch can fail has its plain words (FEE-127): a reason added without them doesn't compile.
const WORDS: Record<FetchFailure, string> = {
  unreachable: 'The site couldn’t be reached.',
  timeout: 'The site took too long to answer.',
  'not-a-feed': 'There’s no feed at this address any more.',
  'too-large': 'It sent more than feedSmith reads.',
  'invalid-url': 'Its address no longer works.',
};

test.each(Object.entries(WORDS))('%s reads as plain words', (reason, words) => {
  expect(notUpdatingReason(reason as FetchFailure)).toBe(words);
});
