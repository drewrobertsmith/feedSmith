import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, TextInput, ToastAndroid, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppButton } from '@/components/app-button';
import { AppText } from '@/components/app-text';
import { useEnvironment } from '@/environment';
import { useAddFeed, type AddFeedReason, type FeedChoice } from '@/feeds/feeds-data';
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

/** Adding a Feed from a website or feed URL. One action: Add Feed. */
export function AddFeedScreen() {
  const insets = useSafeAreaInsets();
  const { colorScheme, fontScale } = useEnvironment();
  const { view, add } = useAddFeed();
  const [url, setUrl] = useState('');
  const busy = view.status === 'busy';
  const field = typeScale.reading;

  const addFrom = async (address: string) => {
    if (!address.trim() || busy) return;
    const outcome = await add(address);
    // Already followed: back to All, with a quiet note naming it (a chip opens it once FEE-29 lands).
    if (outcome.kind === 'already') ToastAndroid.show(`You already follow ${outcome.title}.`, ToastAndroid.SHORT);
    if (outcome.kind !== 'stay') router.back();
  };
  const submit = () => addFrom(url);

  return (
    // Scrolls: a site can offer up to ten feeds, and the largest font size needs the room (Q16).
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
            Website or feed URL
          </AppText>
          <TextInput
            aria-label="Website or feed URL"
            value={url}
            onChangeText={setUrl}
            onSubmitEditing={submit}
            editable={!busy}
            placeholder="theverge.com"
            placeholderTextColor={themes[colorScheme].textMuted}
            inputMode="url"
            keyboardType="url"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="url"
            returnKeyType="go"
            className="rounded-lg border border-text-muted px-group py-related text-text"
            style={{ fontFamily: field.fontFamily, fontSize: field.fontSize * fontScale, minHeight: 48 * fontScale }}
          />
        </View>
        {view.status === 'error' ? (
          <AppText variant="label" role="alert" className="text-text">
            {ERRORS[view.reason]}
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
        <AppButton label={busy ? 'Adding…' : 'Add Feed'} onPress={submit} busy={busy} disabled={!url.trim()} />
      </View>
    </ScrollView>
  );
}
