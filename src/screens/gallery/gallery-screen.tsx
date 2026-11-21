import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/app-text';
import { EnvironmentProvider } from '@/environment';
import { GALLERY } from '@/screens/gallery/registry';
import type { ThemeName } from '@/theme/tokens';
import { createWorld, worldEnvironment, type WorldSpec } from '@/worlds/world';

const ALL = GALLERY.flatMap((entry) => entry.worlds.map((world) => ({ entry, world })));

function Choice({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      role="button"
      aria-label={label}
      aria-selected={selected}
      onPress={onPress}
      className={selected ? 'rounded-full bg-indicator px-3 py-2' : 'rounded-full px-3 py-2'}
    >
      <AppText variant="label" className={selected ? 'text-accent' : 'text-text-muted'}>
        {label}
      </AppText>
    </Pressable>
  );
}

function Row({ children }: { children: ReactNode }) {
  return <View className="flex-row flex-wrap gap-2">{children}</View>;
}

/** Applies the world for as long as it's shown, then hands the theme back to the phone. */
function WorldPreview({ spec, children }: { spec: WorldSpec; children: ReactNode }) {
  // Fixed for the preview's life; the gallery remounts it (by key) to change world.
  const [world] = useState(spec);
  useEffect(() => createWorld(world).dispose, [world]);
  return <EnvironmentProvider environment={worldEnvironment(world)}>{children}</EnvironmentProvider>;
}

/** Dev-only (T13): the real screens, once per world, to walk a ticket's state table. */
export function GalleryScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ world?: string }>();
  const initial = ALL.find(({ world }) => world.id === params.world) ?? ALL[0];

  const [selected, setSelected] = useState(initial);
  const [theme, setTheme] = useState<ThemeName>(initial.world.spec.colorScheme);
  const spec = { ...selected.world.spec, colorScheme: theme };

  return (
    <ScrollView className="flex-1 bg-background" contentContainerStyle={{ paddingTop: insets.top + 16 }}>
      <View className="gap-4 px-5 pb-6">
        <AppText variant="title">State gallery</AppText>
        <Row>
          {(['dark', 'light'] as const).map((name) => (
            <Choice
              key={name}
              label={name === 'dark' ? 'Dark' : 'Light'}
              selected={theme === name}
              onPress={() => setTheme(name)}
            />
          ))}
        </Row>
        {GALLERY.map((entry) => (
          <View key={entry.screen} className="gap-2">
            <AppText variant="label" className="text-text-muted">
              {entry.screen}
            </AppText>
            <Row>
              {entry.worlds.map((world) => (
                <Choice
                  key={world.id}
                  label={world.label}
                  selected={selected.world.id === world.id}
                  onPress={() => {
                    setSelected({ entry, world });
                    setTheme(world.spec.colorScheme);
                  }}
                />
              ))}
            </Row>
          </View>
        ))}
      </View>
      <View className="h-[640px] border-t border-decor">
        <WorldPreview key={`${selected.world.id}-${theme}`} spec={spec}>
          {selected.entry.render(spec)}
        </WorldPreview>
      </View>
    </ScrollView>
  );
}
