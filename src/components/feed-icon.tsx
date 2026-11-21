import { Image } from 'expo-image';
import { useState } from 'react';
import { View } from 'react-native';

import { AppText } from '@/components/app-text';
import { useEnvironment } from '@/environment';

/**
 * A Feed's icon at `size` (scaled with the font size), clipped round: expo-image doesn't take
 * Uniwind's rounding classes. When there's no icon, or it won't load, the Feed's initial
 * shows instead, or nothing (`fallback="none"`). Key it by `url` so a failure never carries
 * over to another Feed.
 */
export function FeedIcon({
  url,
  title,
  size,
  fallback = 'initial',
  testID,
}: {
  url?: string;
  title: string;
  size: number;
  fallback?: 'initial' | 'none';
  testID?: string;
}) {
  const { fontScale } = useEnvironment();
  const [failed, setFailed] = useState(false);
  const side = size * fontScale;

  if (url && !failed) {
    return (
      <View className="overflow-hidden rounded-sm" style={{ width: side, height: side }}>
        <Image
          testID={testID}
          source={{ uri: url }}
          recyclingKey={url}
          onError={() => setFailed(true)}
          accessible={false}
          style={{ width: side, height: side }}
        />
      </View>
    );
  }
  if (fallback === 'none') return null;
  return (
    <View className="items-center justify-center rounded-sm bg-surface" style={{ width: side, height: side }}>
      <AppText variant="label" className="text-text-muted" accessible={false}>
        {title.charAt(0).toUpperCase()}
      </AppText>
    </View>
  );
}
