import { useState } from 'react';
import { Pressable, ScrollView, ToastAndroid, useWindowDimensions, View } from 'react-native';
import Animated, { Easing, Keyframe, LinearTransition, ReduceMotion } from 'react-native-reanimated';

import { AppButton } from '@/components/app-button';
import { AppText } from '@/components/app-text';
import { FeedIcon } from '@/components/feed-icon';
import { NativeSheet } from '@/components/native-sheet';
import { NativeTextField } from '@/components/native-text-field';
import { isAddress, useAddFeed, type AddFeedReason, type AddFeedView, type FeedChoice, type FoundFeed } from '@/feeds/feeds-data';
import { motion } from '@/theme/motion';

/** What went wrong, and what to do next. */
const ERRORS: Record<AddFeedReason, string> = {
  'invalid-url': 'Enter a website or feed URL, like theverge.com.',
  unreachable: 'Couldn’t reach that address. Check it, or enter the site’s feed URL.',
  timeout: 'That address took too long to answer. Try again in a moment.',
  'too-large': 'That feed is too large for feedSmith.',
  'not-a-feed': 'That address isn’t an RSS or Atom feed. Try the site’s feed URL.',
  'no-feed-found': 'No feed found at that address. Try the site’s feed URL.',
};
/** Nothing found, or the search failed: both point to the way that always works, the site's address (FEE-80). */
const PASTE = 'Paste the site’s address instead, like theverge.com.';

const ICON = 24;
const ARRIVE_EASING = Easing.bezier(...motion.resultArrive.easing);
/** A found Feed fades in, rising a few points into its place (motion.resultArrive). */
const ARRIVE = new Keyframe({
  0: { opacity: 0, transform: [{ translateY: motion.resultArrive.distance }] },
  100: { opacity: 1, transform: [{ translateY: 0 }], easing: ARRIVE_EASING },
})
  .duration(motion.resultArrive.duration)
  .reduceMotion(ReduceMotion.System);
/** The rows after it make room on the same curve, so nothing jumps. */
const MAKE_ROOM = LinearTransition.duration(motion.resultArrive.duration).easing(ARRIVE_EASING).reduceMotion(ReduceMotion.System);

/** One of a site's feeds, to choose (T21): its title, and the site it's on. */
function Choice({ choice, onChoose }: { choice: FeedChoice; onChoose: (url: string) => void }) {
  const host = new URL(choice.url).hostname.replace(/^www\./, '');
  return (
    <Pressable
      role="button"
      aria-label={`${choice.title}, ${host}`}
      onPress={() => onChoose(choice.url)}
      className="gap-inside rounded-lg border border-text-muted px-group py-related"
    >
      <AppText variant="reading" className="text-text" accessible={false}>
        {choice.title}
      </AppText>
      <AppText variant="label" className="text-text-muted" accessible={false}>
        {host}
      </AppText>
    </Pressable>
  );
}

/** One Feed found by name (FEE-80): its icon, name and site, and whether you already follow it. */
function Found({ found, onChoose }: { found: FoundFeed; onChoose: (found: FoundFeed) => void }) {
  const following = found.kind === 'following';
  return (
    <Animated.View entering={ARRIVE} layout={MAKE_ROOM}>
      <Pressable
        role="button"
        aria-label={`${found.title}, ${found.host}${following ? ', following' : ''}`}
        onPress={() => onChoose(found)}
        className="flex-row items-center gap-related rounded-lg border border-text-muted px-group py-related"
      >
        <FeedIcon url={found.iconUrl} title={found.title} size={ICON} />
        <View className="flex-1 gap-inside">
          <AppText variant="reading" className="text-text" accessible={false}>
            {found.title}
          </AppText>
          {/* Following joins the site's line, so the name keeps the row's width at every font size (Q16). */}
          <AppText variant="label" className="text-text-muted" accessible={false}>
            {following ? `${found.host} · Following` : found.host}
          </AppText>
        </View>
      </Pressable>
    </Animated.View>
  );
}

/** What's found for a name, best first, under a line saying whether the search is still going. */
function FoundList({ view, onChoose }: { view: Extract<AddFeedView, { status: 'found' }>; onChoose: (found: FoundFeed) => void }) {
  return (
    <View className="gap-related">
      <AppText variant="label" className="text-text-muted" aria-live="polite">
        {view.phase === 'searching' ? `Looking for “${view.name}”…` : `Feeds for “${view.name}”`}
      </AppText>
      {view.results.map((found) => (
        <Found key={found.kind === 'new' ? found.url : found.feedId} found={found} onChoose={onChoose} />
      ))}
    </View>
  );
}

/** Guessing searches used up for now (FEE-88): said calmly, with the way that always works. */
const LIMITED = 'Try again in a few minutes. You can still paste the site’s address.';

/** Why a search for a name came to nothing or stopped short, or null while there's nothing to say. */
function findMessage(view: AddFeedView): string | null {
  if (view.status !== 'found') return null;
  if (view.phase === 'limited') return LIMITED;
  if (view.phase === 'searching' || view.results.length > 0) return null;
  return view.phase === 'failed' ? `Couldn’t search just now. ${PASTE}` : `No feeds found for “${view.name}”. ${PASTE}`;
}

/**
 * The search whose results to list, or null: none under a message, except a limit message (FEE-88),
 * under which what the catalog already knew stays listed.
 */
function listedSearch(view: AddFeedView, message: string | null) {
  if (view.status !== 'found') return null;
  if (message === null) return view;
  return view.phase === 'limited' && view.results.length > 0 ? view : null;
}

/** At most this much of the screen's height: a long list of feeds scrolls inside the sheet (Q16). */
const SHEET_MAX = 0.85;

/**
 * Adding a Feed, in a sheet over Feeds (FEE-45, Q32): from a website or feed URL, or by finding one
 * by its site's name (FEE-80). One action: Add Feed for an address, Find Feeds for a name. What's
 * typed stays while the sheet is closed, for the next time it opens; a Feed added, or one already
 * followed, closes it on that Feed's chip (`onFeed`), a followed one with a quiet note naming it (T22).
 */
export function AddFeedSheet({ open, onClose, onFeed }: { open: boolean; onClose: () => void; onFeed: (feedId: string) => void }) {
  const { view, add } = useAddFeed();
  // A search shown on arrival (the state gallery) keeps the name it was for in the field.
  const [typed, setTyped] = useState(() => (view.status === 'found' ? view.name : ''));
  // The field keeps its own text natively; after an add it starts afresh, empty.
  const [adds, setAdds] = useState(0);
  const { height } = useWindowDimensions();
  const adding = view.status === 'busy';
  const searching = view.status === 'found' && view.phase === 'searching';
  const byName = typed.trim() !== '' && !isAddress(typed);
  const error = view.status === 'error' ? ERRORS[view.reason] : findMessage(view);
  const listed = listedSearch(view, error);

  const followed = (title: string, feedId: string) => {
    ToastAndroid.show(`You already follow ${title}.`, ToastAndroid.SHORT);
    onFeed(feedId);
  };
  const addFrom = async (address: string) => {
    if (!address.trim() || adding || searching) return;
    const outcome = await add(address);
    if (outcome.kind === 'already') followed(outcome.title, outcome.feedId);
    else if (outcome.kind === 'added') {
      setTyped('');
      setAdds((count) => count + 1);
      // Even if the sheet was swiped shut while adding: the Feed was added, so its chip opens.
      onFeed(outcome.feedId);
    }
  };
  const choose = (found: FoundFeed) => {
    if (found.kind === 'following') followed(found.title, found.feedId);
    else void addFrom(found.url);
  };
  const submit = () => addFrom(typed);

  return (
    <NativeSheet open={open} onClose={onClose}>
      {/* Scrolls past most of the screen: a site can offer up to ten feeds, and the largest font needs room (Q16). */}
      <ScrollView testID="add-feed-sheet" style={{ maxHeight: height * SHEET_MAX }} keyboardShouldPersistTaps="handled">
        <View className="gap-group px-edge pb-section">
          <AppText variant="title" className="text-text">
            Add a Feed
          </AppText>
          <View className="gap-related">
            <AppText variant="label" className="text-text-muted" accessible={false}>
              Website, feed URL or name
            </AppText>
            <NativeTextField
              key={adds}
              purpose="address"
              label="Website, feed URL or name"
              placeholder="theverge.com"
              defaultValue={typed}
              onChangeText={setTyped}
              onSubmitEditing={() => void submit()}
              editable={!adding}
            />
          </View>
          {error ? (
            <AppText variant="label" role="alert" className="text-text">
              {error}
            </AppText>
          ) : null}
          {view.status === 'choose' ? (
            <View className="gap-related">
              <AppText variant="label" className="text-text-muted">
                This site has more than one feed. Choose one.
              </AppText>
              {view.choices.map((choice) => (
                <Choice key={choice.url} choice={choice} onChoose={addFrom} />
              ))}
            </View>
          ) : null}
          {listed ? <FoundList view={listed} onChoose={choose} /> : null}
          <AppButton
            label={adding ? 'Adding…' : searching ? 'Finding…' : byName ? 'Find Feeds' : 'Add Feed'}
            onPress={() => void submit()}
            busy={adding || searching}
            disabled={!typed.trim()}
          />
        </View>
      </ScrollView>
    </NativeSheet>
  );
}
