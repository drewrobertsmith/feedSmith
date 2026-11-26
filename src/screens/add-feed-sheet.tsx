import { useState } from 'react';
import { ScrollView, ToastAndroid, useWindowDimensions, View } from 'react-native';

import { AppButton } from '@/components/app-button';
import { AppText } from '@/components/app-text';
import { NativeSheet } from '@/components/native-sheet';
import { NativeTextField } from '@/components/native-text-field';
import { DepthPressable } from '@/components/depth-pressable';
import { useAddFeed, type AddFeedReason, type FeedChoice } from '@/feeds/feeds-data';

/** What went wrong, and what to do next. */
const ERRORS: Record<AddFeedReason, string> = {
  'invalid-url': 'Enter a website or feed URL, like theverge.com.',
  unreachable: 'Couldn’t reach that address. Check it, or enter the site’s feed URL.',
  timeout: 'That address took too long to answer. Try again in a moment.',
  'too-large': 'That feed is too large for feedSmith.',
  'not-a-feed': 'That address isn’t an RSS or Atom feed. Try the site’s feed URL.',
  'no-feed-found': 'No feed found at that address. Try the site’s feed URL.',
};

/** One of a site's feeds, to choose (T21): its title, and the site it's on. */
function Choice({ choice, onChoose }: { choice: FeedChoice; onChoose: (url: string) => void }) {
  const host = new URL(choice.url).hostname.replace(/^www\./, '');
  return (
    // A choice you press: a soft card on the sheet, sinking as it's pressed (FEE-81, D27).
    <DepthPressable
      level="soft"
      shape="card"
      role="button"
      aria-label={`${choice.title}, ${host}`}
      onPress={() => onChoose(choice.url)}
      className="gap-inside px-group py-related"
    >
      <AppText variant="reading" className="text-text" accessible={false}>
        {choice.title}
      </AppText>
      <AppText variant="label" className="text-text-muted" accessible={false}>
        {host}
      </AppText>
    </DepthPressable>
  );
}

/** At most this much of the screen's height: a long list of feeds scrolls inside the sheet (Q16). */
const SHEET_MAX = 0.85;

/**
 * Adding a Feed, in a sheet over Feeds (FEE-45, Q32): from a website or feed URL, and nothing else
 * (FEE-96). What's typed stays while the sheet is closed, for the next time it opens; a Feed added,
 * or one already followed, closes it on that Feed's chip (`onFeed`), a followed one with a quiet
 * note naming it (T22).
 */
export function AddFeedSheet({ open, onClose, onFeed }: { open: boolean; onClose: () => void; onFeed: (feedId: string) => void }) {
  const { view, add } = useAddFeed();
  const [typed, setTyped] = useState('');
  // The field keeps its own text natively; after an add it starts afresh, empty.
  const [adds, setAdds] = useState(0);
  const { height } = useWindowDimensions();
  const adding = view.status === 'busy';
  const error = view.status === 'error' ? ERRORS[view.reason] : null;

  const followed = (title: string, feedId: string) => {
    ToastAndroid.show(`You already follow ${title}.`, ToastAndroid.SHORT);
    onFeed(feedId);
  };
  const addFrom = async (address: string) => {
    if (!address.trim() || adding) return;
    const outcome = await add(address);
    if (outcome.kind === 'already') followed(outcome.title, outcome.feedId);
    else if (outcome.kind === 'added') {
      setTyped('');
      setAdds((count) => count + 1);
      // Even if the sheet was swiped shut while adding: the Feed was added, so its chip opens.
      onFeed(outcome.feedId);
    }
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
          {/* Material's filled field, its label floating inside it (FEE-81). */}
          <NativeTextField
            key={adds}
            label="Website or feed URL"
            placeholder="theverge.com"
            defaultValue={typed}
            onChangeText={setTyped}
            onSubmitEditing={() => void submit()}
            editable={!adding}
          />
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
          <AppButton
            label={adding ? 'Adding…' : 'Add Feed'}
            onPress={() => void submit()}
            busy={adding}
            disabled={!typed.trim()}
          />
        </View>
      </ScrollView>
    </NativeSheet>
  );
}
