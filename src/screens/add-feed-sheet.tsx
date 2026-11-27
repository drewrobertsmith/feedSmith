import { useState } from 'react';
import { ScrollView, ToastAndroid, useWindowDimensions, View } from 'react-native';

import { AppButton } from '@/components/app-button';
import { AppText } from '@/components/app-text';
import { NativeSheet } from '@/components/native-sheet';
import { NativeTextField } from '@/components/native-text-field';
import { DepthPressable } from '@/components/depth-pressable';
import { useAddFeed, useNewAddress, type AddFeedReason, type AddressForm, type FeedChoice } from '@/feeds/feeds-data';

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

/** What tells one address sheet from another: its words, and the form it sends to. */
type AddressSheetProps = {
  open: boolean;
  onClose: () => void;
  /** A Feed found or already followed: the sheet closes on its chip. */
  onFeed: (feedId: string) => void;
  form: AddressForm;
  heading: string;
  /** A line under the heading saying what happens. */
  hint?: string;
  placeholder?: string;
  submit: { label: string; busyLabel: string };
  testID: string;
};

/**
 * A sheet that takes a website or feed URL (FEE-45, Q32): adding a Feed, or giving one a new address (FEE-129). What's
 * typed stays while the sheet is closed, for the next time it opens; a Feed found, or one already followed, closes it
 * on that Feed's chip (`onFeed`), a followed one with a quiet note naming it (T22).
 */
function AddressSheet({ open, onClose, onFeed, form, heading, hint, placeholder, submit: labels, testID }: AddressSheetProps) {
  const { view, add } = form;
  const [typed, setTyped] = useState('');
  // The field keeps its own text natively; after a Feed is found it starts afresh, empty.
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
      // Even if the sheet was swiped shut meanwhile: the Feed was found, so its chip opens.
      onFeed(outcome.feedId);
    }
  };
  const submit = () => addFrom(typed);

  return (
    <NativeSheet open={open} onClose={onClose}>
      {/* Scrolls past most of the screen: a site can offer up to ten feeds, and the largest font needs room (Q16). */}
      <ScrollView testID={testID} style={{ maxHeight: height * SHEET_MAX }} keyboardShouldPersistTaps="handled">
        <View className="gap-group px-edge pb-section">
          <AppText variant="title" className="text-text">
            {heading}
          </AppText>
          {hint ? (
            <AppText variant="label" className="text-text-muted">
              {hint}
            </AppText>
          ) : null}
          {/* Material's filled field, its label floating inside it (FEE-81). */}
          <NativeTextField
            key={adds}
            label="Website or feed URL"
            placeholder={placeholder}
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
          <AppButton label={adding ? labels.busyLabel : labels.label} onPress={() => void submit()} busy={adding} disabled={!typed.trim()} />
        </View>
      </ScrollView>
    </NativeSheet>
  );
}

type SheetProps = Pick<AddressSheetProps, 'open' | 'onClose' | 'onFeed'>;

/** Adding a Feed, in a sheet over Feeds (FEE-45), from a website or feed URL and nothing else (FEE-96). */
export function AddFeedSheet(props: SheetProps) {
  return (
    <AddressSheet
      {...props}
      form={useAddFeed()}
      heading="Add a Feed"
      placeholder="theverge.com"
      submit={{ label: 'Add Feed', busyLabel: 'Adding…' }}
      testID="add-feed-sheet"
    />
  );
}

/**
 * A not-updating Feed's new address (FEE-129), found as adding finds one; the Feed keeps its name and Articles. It
 * starts empty and suggests nothing, so nothing in it reads as the old address (Q9).
 */
export function NewAddressSheet({ feed, ...props }: SheetProps & { feed: { id: string; title: string } }) {
  return (
    <AddressSheet
      {...props}
      form={useNewAddress(feed.id)}
      heading={`New address for ${feed.title}`}
      hint="Its name and Articles stay."
      submit={{ label: 'Use this address', busyLabel: 'Checking…' }}
      testID="new-address-sheet"
    />
  );
}
