import { Image } from 'expo-image';
import { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, ScrollView, ToastAndroid, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { useEnvironment } from '@/environment';
import { useSetPinned, type FeedChip } from '@/feeds/feeds-data';
import { motion } from '@/theme/motion';
import { spacing } from '@/theme/spacing';

const ICON = 16;

/** One chip: a tab in the row. Chosen, it's Gold on the indicator pill (D5) and springs into place (D7). */
function Chip({
  label,
  accessibleName,
  selected,
  icon,
  onPress,
  onLongPress,
}: {
  label: string;
  accessibleName: string;
  selected: boolean;
  icon?: React.ReactNode;
  onPress: () => void;
  onLongPress?: () => void;
}) {
  const { reduceMotion } = useEnvironment();
  const [scale] = useState(() => new Animated.Value(1));
  const wasSelected = useRef(selected);

  useEffect(() => {
    // Only a chip that becomes chosen moves; "Remove animations" keeps just the colour change (Q17).
    if (selected && !wasSelected.current && !reduceMotion) {
      scale.setValue(motion.chipSelect.from);
      Animated.spring(scale, {
        toValue: 1,
        damping: motion.chipSelect.damping,
        stiffness: motion.chipSelect.stiffness,
        useNativeDriver: true,
      }).start();
    }
    wasSelected.current = selected;
  }, [selected, reduceMotion, scale]);

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Pressable
        role="tab"
        aria-label={accessibleName}
        aria-selected={selected}
        onPress={onPress}
        onLongPress={onLongPress}
        className={
          selected
            ? 'flex-row items-center gap-inside rounded-full bg-indicator px-group py-related'
            : 'flex-row items-center gap-inside rounded-full border border-text-muted px-group py-related'
        }
      >
        {icon}
        <AppText variant="label" className={selected ? 'text-accent' : 'text-text'} accessible={false}>
          {label}
        </AppText>
      </Pressable>
    </Animated.View>
  );
}

function ChipIcon({ chip }: { chip: FeedChip }) {
  const { fontScale } = useEnvironment();
  const [failed, setFailed] = useState(false);
  const size = ICON * fontScale;
  if (!chip.faviconUrl || failed) return null;
  return (
    <View className="overflow-hidden rounded-sm" style={{ width: size, height: size }}>
      <Image
        source={{ uri: chip.faviconUrl }}
        recyclingKey={chip.faviconUrl}
        onError={() => setFailed(true)}
        accessible={false}
        style={{ width: size, height: size }}
      />
    </View>
  );
}

/**
 * The chip row under the Feeds top bar (P5, P9, P10): All, then the Feeds in the server's order
 * (Pinned first), then "+" to add one. Long-press Pins or unpins.
 */
export function ChipRow({
  chips,
  selected,
  onSelect,
  onAdd,
}: {
  chips: FeedChip[];
  /** The chosen Feed's id, or null for All. */
  selected: string | null;
  onSelect: (feedId: string | null) => void;
  onAdd: () => void;
}) {
  const setPinned = useSetPinned();

  const togglePin = async (chip: FeedChip) => {
    const outcome = await setPinned(chip.id, !chip.pinned);
    const note =
      outcome === 'pins-full'
        ? 'You can Pin up to 3 Feeds. Unpin one first.'
        : outcome === 'ok'
          ? `${chip.pinned ? 'Unpinned' : 'Pinned'} ${chip.title}.`
          : null;
    if (note) ToastAndroid.show(note, ToastAndroid.SHORT);
  };

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      role="tablist"
      aria-label="Feeds"
      contentContainerClassName="items-center gap-related px-edge"
      contentContainerStyle={{ paddingBottom: spacing.related }}
    >
      <Chip label="All" accessibleName="All" selected={selected === null} onPress={() => onSelect(null)} />
      {chips.map((chip) => (
        <Chip
          key={chip.id}
          label={chip.title}
          accessibleName={chip.pinned ? `${chip.title}, Pinned` : chip.title}
          selected={selected === chip.id}
          icon={<ChipIcon key={chip.faviconUrl} chip={chip} />}
          onPress={() => onSelect(chip.id)}
          onLongPress={() => void togglePin(chip)}
        />
      ))}
      <Pressable
        role="button"
        aria-label="Add a Feed"
        onPress={onAdd}
        className="rounded-full border border-text-muted px-group py-related"
      >
        <AppText variant="label" className="text-text" accessible={false}>
          +
        </AppText>
      </Pressable>
    </ScrollView>
  );
}
