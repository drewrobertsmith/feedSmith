import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import { LogBox, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/app-text';
import { AuthContext } from '@/auth/auth-context';
import { EnvironmentProvider } from '@/environment';
import { isShot, readyLine } from '@/screens/gallery/capture-ready';
import { GALLERY, type GalleryEntry } from '@/screens/gallery/registry';
import { spacing } from '@/theme/spacing';
import type { ThemeName } from '@/theme/tokens';
import { FeedsContext } from '@/feeds/feeds-data';
import { createWorld, worldAuth, worldEnvironment, worldFeeds, type CatalogWorld } from '@/worlds/world';

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

/** How long after a world opens its new Articles arrive (FEE-102). */
const ARRIVAL_DELAY = 300;

/**
 * Applies the world for as long as it's shown, then hands the theme back to the phone. In capture mode
 * (`shot`), it tells the visual check when the world is ready (FEE-121): once its new Articles, if it has
 * any, are on screen, and two frames have drawn them.
 */
function WorldPreview({ entry, world, theme, shot }: { entry: GalleryEntry; world: CatalogWorld; theme: ThemeName; shot?: string }) {
  const spec = { ...world.spec, colorScheme: theme };
  // `world` comes from the catalog, so it's stable while it stays selected.
  useEffect(() => createWorld({ ...world.spec, colorScheme: theme }).dispose, [world, theme]);
  // One world's Feeds for as long as it's shown: removing a Feed changes it, and it keeps the change (FEE-97).
  const [feeds] = useState(() => worldFeeds(spec));
  // A world whose new Articles arrive does so just after it opens (FEE-102); capture mode says ready only after.
  const [arrived, setArrived] = useState(world.spec.arrivals !== 'later');
  useEffect(() => {
    if (world.spec.arrivals !== 'later') return;
    const timer = setTimeout(() => {
      feeds.arrive();
      setArrived(true);
    }, ARRIVAL_DELAY);
    return () => clearTimeout(timer);
  }, [world, feeds]);
  useEffect(() => {
    if (shot === undefined || !arrived) return;
    let frame = requestAnimationFrame(() => {
      // The visual check reads this line from logcat (FEE-121).
      frame = requestAnimationFrame(() => console.log(readyLine(shot, `${world.id}-${theme}`)));
    });
    return () => cancelAnimationFrame(frame);
  }, [shot, arrived, world, theme]);
  return (
    <AuthContext value={worldAuth(spec)}>
      <FeedsContext value={feeds}>
        <EnvironmentProvider environment={worldEnvironment(spec)}>{entry.render(spec)}</EnvironmentProvider>
      </FeedsContext>
    </AuthContext>
  );
}

/** A world alone, filling the screen, for the visual check (FEE-70): no dev warnings drawn over it. */
function Capture({ children }: { children: ReactNode }) {
  useEffect(() => {
    LogBox.ignoreAllLogs(true);
    return () => LogBox.ignoreAllLogs(false);
  }, []);
  return <View className="flex-1 bg-background">{children}</View>;
}

/** Dev-only (T13): the real screens, once per world, to walk a ticket's state table. */
export function GalleryScreen() {
  const insets = useSafeAreaInsets();
  // The link is the single source of truth, so `feedsmith://gallery?world=…&theme=…`
  // switches an open gallery too. `capture=1` shows the world alone, filling the screen, for the visual check (FEE-70); `shot` numbers that capture (FEE-121).
  const params = useLocalSearchParams<{ world?: string; theme?: string; capture?: string; shot?: string }>();
  const selected = ALL.find(({ world }) => world.id === params.world) ?? ALL[0];
  // Link parameters are untrusted (Q25): anything but a known theme means the world's own.
  const theme = params.theme === 'dark' || params.theme === 'light' ? params.theme : selected.world.spec.colorScheme;

  if (params.capture === '1') {
    return (
      <Capture>
        {/* Keyed by the shot too, so capturing the same world again starts it fresh and says ready again. */}
        <WorldPreview
          key={`${selected.world.id}-${theme}-${params.shot}`}
          entry={selected.entry}
          world={selected.world}
          theme={theme}
          shot={isShot(params.shot) ? params.shot : undefined}
        />
      </Capture>
    );
  }

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
        {/* Keyed, so choosing another world or theme starts it fresh. */}
        <WorldPreview key={`${selected.world.id}-${theme}`} entry={selected.entry} world={selected.world} theme={theme} />
      </View>
    </ScrollView>
  );
}
