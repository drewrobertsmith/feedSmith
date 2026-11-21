import { router } from 'expo-router';
import { useState } from 'react';
import { TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppButton } from '@/components/app-button';
import { AppText } from '@/components/app-text';
import { useEnvironment } from '@/environment';
import { useAddFeed, type AddFeedReason } from '@/feeds/feeds-data';
import { spacing } from '@/theme/spacing';
import { themes } from '@/theme/tokens';
import { typeScale } from '@/theme/type';

/** What went wrong, and what to do next. */
const ERRORS: Record<AddFeedReason, string> = {
  'invalid-url': 'Enter a feed URL that starts with https://.',
  unreachable: 'Couldn’t reach that address. Check the URL and your connection, then try again.',
  timeout: 'That address took too long to answer. Try again in a moment.',
  'too-large': 'That feed is too large for feedSmith.',
  'not-a-feed': 'That address isn’t an RSS or Atom feed. Try the site’s feed URL.',
  'already-added': 'You already follow this Feed.',
};

/** Adding a Feed by its URL. One action: Add Feed. */
export function AddFeedScreen() {
  const insets = useSafeAreaInsets();
  const { colorScheme, fontScale } = useEnvironment();
  const { view, add } = useAddFeed();
  const [url, setUrl] = useState('');
  const busy = view.status === 'busy';
  const field = typeScale.reading;

  const submit = async () => {
    if (!url.trim() || busy) return;
    if (await add(url)) router.back();
  };

  return (
    <View className="flex-1 gap-section bg-background px-edge" style={{ paddingTop: insets.top + spacing.section }}>
      <AppText variant="title">Add a Feed</AppText>
      <View className="gap-group">
        <View className="gap-related">
          <AppText variant="label" className="text-text-muted" accessible={false}>
            Feed URL
          </AppText>
          <TextInput
            aria-label="Feed URL"
            value={url}
            onChangeText={setUrl}
            onSubmitEditing={submit}
            editable={!busy}
            placeholder="https://example.com/feed"
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
        <AppButton label={busy ? 'Adding…' : 'Add Feed'} onPress={submit} busy={busy} disabled={!url.trim()} />
      </View>
    </View>
  );
}
