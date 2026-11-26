import type { FetchFailure } from '../../convex/lib/feed/validators';

const REASONS: Record<FetchFailure, string> = {
  unreachable: 'The site couldn’t be reached.',
  timeout: 'The site took too long to answer.',
  'not-a-feed': 'There’s no feed at this address any more.',
  'too-large': 'It sent more than feedSmith reads.',
  'invalid-url': 'Its address no longer works.',
};

/** Why a Feed is not updating, in plain words (FEE-127). Never its address (Q9). */
export function notUpdatingReason(reason: FetchFailure): string {
  return REASONS[reason];
}
