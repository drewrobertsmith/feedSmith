import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, type ReactNode } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/app-text';
import { AuthContext } from '@/auth/auth-context';
import { EnvironmentProvider } from '@/environment';
import { GALLERY, type GalleryEntry } from '@/screens/gallery/registry';
import { spacing } from '@/theme/spacing';
import type { ThemeName } from '@/theme/tokens';
import { createWorld, worldAuth, worldEnvironment, type CatalogWorld } from '@/worlds/world';

const ALL = GALLERY.flatMap((entry) => entry.worlds.map((world) => ({ entry, world })));

function Choice({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      role="radio"
      aria-label={label}
      aria-checked={selected}
      onPress={onPress}
      className={selected ? 'rounded-full bg-indicator px-related py-inside' : 'rounded-full px-related py-inside'}
    >
      <AppText variant="label" className={selected ? 'text-accent' : 'text-text-muted'}>
        {label}
      </AppText>
    </Pressable>
  );
}

/** A single-choice group of `Choice`s. */
function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View role="radiogroup" aria-label={label} className="flex-row flex-wrap gap-related">
      {children}
    </View>
  );
}

/** Applies the world for as long as it's shown, then hands the theme back to the phone. */
function WorldPreview({ entry, world, theme }: { entry: GalleryEntry; world: CatalogWorld; theme: ThemeName }) {
  const spec = { ...world.spec, colorScheme: theme };
  // `world` comes from the catalog, so it's stable while it stays selected.
  useEffect(() => createWorld({ ...world.spec, colorScheme: theme }).dispose, [world, theme]);
  return (
    <AuthContext value={worldAuth(spec)}>
      <EnvironmentProvider environment={worldEnvironment(spec)}>{entry.render(spec)}</EnvironmentProvider>
    </AuthContext>
  );
}

/** Dev-only (T13): the real screens, once per world, to walk a ticket's state table. */
export function GalleryScreen() {
  const insets = useSafeAreaInsets();
  // The link is the single source of truth, so `feedsmith://gallery?world=…&theme=…`
  // switches an open gallery too.
  const params = useLocalSearchParams<{ world?: string; theme?: ThemeName }>();
  const selected = ALL.find(({ world }) => world.id === params.world) ?? ALL[0];
  const theme = params.theme ?? selected.world.spec.colorScheme;

  return (
    <ScrollView className="flex-1 bg-background">
      <View className="gap-group px-edge pb-section" style={{ paddingTop: insets.top + spacing.group }}>
        <AppText variant="title">State gallery</AppText>
        <Row label="Theme">
          {(['dark', 'light'] as const).map((name) => (
            <Choice
              key={name}
              label={name === 'dark' ? 'Dark' : 'Light'}
              selected={theme === name}
              onPress={() => router.setParams({ theme: name })}
            />
          ))}
        </Row>
        {GALLERY.map((entry) => (
          <View key={entry.screen} className="gap-related">
            <AppText variant="label" className="text-text-muted">
              {entry.screen}
            </AppText>
            <Row label={`${entry.screen} worlds`}>
              {entry.worlds.map((world) => (
                <Choice
                  key={world.id}
                  label={world.label}
                  selected={selected.world.id === world.id}
                  onPress={() => router.setParams({ world: world.id, theme: undefined })}
                />
              ))}
            </Row>
          </View>
        ))}
      </View>
      <View className="h-[640px] border-t border-decor">
        <WorldPreview entry={selected.entry} world={selected.world} theme={theme} />
      </View>
    </ScrollView>
  );
}
