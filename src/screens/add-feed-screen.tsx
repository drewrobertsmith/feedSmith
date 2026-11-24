import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, TextInput, ToastAndroid, View } from 'react-native';
import Animated, { Easing, Keyframe, LinearTransition, ReduceMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppButton } from '@/components/app-button';
import { AppText } from '@/components/app-text';
import { FeedIcon } from '@/components/feed-icon';
import { useEnvironment } from '@/environment';
import { isAddress, useAddFeed, type AddFeedReason, type AddFeedView, type FeedChoice, type FoundFeed } from '@/feeds/feeds-data';
import { motion } from '@/theme/motion';
import { spacing } from '@/theme/spacing';
import { themes } from '@/theme/tokens';
import { typeScale } from '@/theme/type';

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

/** Back to Feeds with a followed Feed's chip chosen, and a quiet note naming it (T22). */
function showFollowed(title: string, feedId: string) {
  ToastAndroid.show(`You already follow ${title}.`, ToastAndroid.SHORT);
  router.dismissTo({ pathname: '/', params: { feed: feedId } });
}

/**
 * Adding a Feed from a website or feed URL, or finding one by its site's name (FEE-80). One action:
 * Add Feed for an address, Find Feeds for a name.
 */
export function AddFeedScreen() {
  const insets = useSafeAreaInsets();
  const { colorScheme, fontScale } = useEnvironment();
  const { view, add } = useAddFeed();
  // A search shown on arrival (the state gallery) keeps the name it was for in the field.
  const [typed, setTyped] = useState(() => (view.status === 'found' ? view.name : ''));
  const adding = view.status === 'busy';
  const searching = view.status === 'found' && view.phase === 'searching';
  const byName = typed.trim() !== '' && !isAddress(typed);
  const field = typeScale.reading;
  const error = view.status === 'error' ? ERRORS[view.reason] : findMessage(view);

  const addFrom = async (address: string) => {
    if (!address.trim() || adding || searching) return;
    const outcome = await add(address);
    if (outcome.kind === 'already') showFollowed(outcome.title, outcome.feedId);
    else if (outcome.kind === 'added') router.back();
  };
  const choose = (found: FoundFeed) => {
    if (found.kind === 'following') showFollowed(found.title, found.feedId);
    else void addFrom(found.url);
  };
  const submit = () => addFrom(typed);

  return (
    // Scrolls: a site can offer up to ten feeds, a search finds several, and the largest font size needs the room (Q16).
    <ScrollView
      className="flex-1 bg-background"
      contentContainerClassName="gap-section px-edge"
      contentContainerStyle={{ paddingTop: insets.top + spacing.section, paddingBottom: insets.bottom + spacing.section }}
      keyboardShouldPersistTaps="handled"
    >
      <AppText variant="title">Add a Feed</AppText>
      <View className="gap-group">
        <View className="gap-related">
          <AppText variant="label" className="text-text-muted" accessible={false}>
            Website, feed URL or name
          </AppText>
          <TextInput
            aria-label="Website, feed URL or name"
            value={typed}
            onChangeText={setTyped}
            onSubmitEditing={submit}
            editable={!adding}
            placeholder="theverge.com"
            placeholderTextColor={themes[colorScheme].textMuted}
            inputMode="url"
            keyboardType="url"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="url"
            returnKeyType="go"
            className="rounded-lg border border-text-muted px-group py-related"
            // Its colour is a style, not a class: the class reaches Android's field a second or two late,
            // and a field opened holding text (a search shown on arrival) drew none until then.
            style={{ color: themes[colorScheme].text, fontFamily: field.fontFamily, fontSize: field.fontSize * fontScale, minHeight: 48 * fontScale }}
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
        {/* What the catalog already knew stays listed under a limit message (FEE-88). */}
        {view.status === 'found' && (error === null || (view.phase === 'limited' && view.results.length > 0)) ? (
          <FoundList view={view} onChoose={choose} />
        ) : null}
        <AppButton
          label={adding ? 'Adding…' : searching ? 'Finding…' : byName ? 'Find Feeds' : 'Add Feed'}
          onPress={submit}
          busy={adding || searching}
          disabled={!typed.trim()}
        />
      </View>
    </ScrollView>
  );
}
