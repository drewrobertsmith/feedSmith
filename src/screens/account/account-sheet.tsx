import { router } from 'expo-router';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { useAuth } from '@/auth/auth-context';
import { AppText } from '@/components/app-text';
import { NativeSheet } from '@/components/native-sheet';
import { useEnvironment } from '@/environment';
import { spacing } from '@/theme/spacing';
import { themes } from '@/theme/tokens';

const CIRCLE = 32;
const ICON = 24;
/** A row tall enough for a thumb (Android's 48 dp). */
const ROW = 48;

/** One thing to do in the sheet: an icon and its words, the whole row tappable. */
function SheetRow({
  label,
  icon,
  onPress,
  busy = false,
  busyLabel,
}: {
  label: string;
  icon: SymbolViewProps['name'];
  onPress: () => void;
  busy?: boolean;
  busyLabel?: string;
}) {
  const { colorScheme } = useEnvironment();
  const shown = busy && busyLabel ? busyLabel : label;
  return (
    <Pressable
      role="button"
      aria-label={shown}
      aria-busy={busy}
      aria-disabled={busy}
      disabled={busy}
      onPress={onPress}
      android_ripple={{ color: themes[colorScheme].background }}
      className={busy ? 'flex-row items-center gap-group px-edge opacity-60' : 'flex-row items-center gap-group px-edge'}
      style={{ minHeight: ROW }}
    >
      <SymbolView name={icon} size={ICON} tintColor={themes[colorScheme].text} />
      <AppText variant="action" className="shrink text-text" accessible={false}>
        {shown}
      </AppText>
    </Pressable>
  );
}

/**
 * The Account sheet (P17): who is signed in, Manage Feeds (D17), then Sign out last, behind a
 * divider (Q32). Delete account joins Sign out there with FEE-36.
 */
function AccountSheetContent({ onClose }: { onClose: () => void }) {
  const { account, signOut, signingOut } = useAuth();
  const { colorScheme } = useEnvironment();
  const manageFeeds = () => {
    onClose();
    router.push('/manage-feeds');
  };

  return (
    <View testID="account-sheet" className="gap-related pb-section">
      {account ? (
        // The Account's value, shown without opening anything (Q33).
        <View className="gap-inside px-edge pb-related">
          <AppText variant="title" className="text-text">
            {account.name ?? account.email}
          </AppText>
          {account.name ? (
            <AppText variant="label" className="text-text-muted">
              {account.email}
            </AppText>
          ) : null}
        </View>
      ) : null}
      <SheetRow label="Manage Feeds" icon={{ ios: 'slider.horizontal.3', android: 'tune' }} onPress={manageFeeds} />
      <View className="mx-edge" style={{ height: StyleSheet.hairlineWidth, backgroundColor: themes[colorScheme].decor }} />
      <SheetRow
        label="Sign out"
        busyLabel="Signing out"
        busy={signingOut}
        icon={{ ios: 'rectangle.portrait.and.arrow.right', android: 'logout' }}
        onPress={() => void signOut()}
      />
    </View>
  );
}

/**
 * The account circle at the top right of Feeds and Saved (P17): the User's initial in D5's
 * "yours" colours (Gold on Navy, deep gold on sand). Tapping it opens the Account sheet.
 * `initiallyOpen` is for the state gallery's open-sheet worlds.
 */
export function AccountButton({ initiallyOpen = false }: { initiallyOpen?: boolean }) {
  const { account } = useAuth();
  const { fontScale } = useEnvironment();
  const [open, setOpen] = useState(initiallyOpen);
  const close = () => setOpen(false);
  const size = CIRCLE * fontScale;

  return (
    <>
      <Pressable
        role="button"
        aria-label={account ? `Account, ${account.name ?? account.email}` : 'Account'}
        onPress={() => setOpen(true)}
        // With the hit slop the target reaches 48 dp (Q15).
        hitSlop={spacing.related}
        className="items-center justify-center rounded-full bg-indicator"
        style={{ width: size, height: size }}
      >
        {account ? (
          <AppText variant="label" className="text-accent" accessible={false}>
            {account.initial}
          </AppText>
        ) : null}
      </Pressable>
      <NativeSheet open={open} onClose={close}>
        <AccountSheetContent onClose={close} />
      </NativeSheet>
    </>
  );
}
