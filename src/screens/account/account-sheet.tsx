import { router } from 'expo-router';
import type { SymbolViewProps } from 'expo-symbols';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import { useAuth } from '@/auth/auth-context';
import { AppSymbol } from '@/components/app-symbol';
import { AppText } from '@/components/app-text';
import { DepthPressable } from '@/components/depth-pressable';
import { NativeSheet } from '@/components/native-sheet';
import { useEnvironment, useSizeScale } from '@/environment';
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
  tone = 'plain',
}: {
  label: string;
  icon: SymbolViewProps['name'];
  onPress: () => void;
  busy?: boolean;
  busyLabel?: string;
  /** `destructive` colours it brick: this action deletes something for good (D19). */
  tone?: 'plain' | 'destructive';
}) {
  const { colorScheme } = useEnvironment();
  const shown = busy && busyLabel ? busyLabel : label;
  const destructive = tone === 'destructive';
  const colour = destructive ? themes[colorScheme].destructive : themes[colorScheme].text;
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
      {/* The icon grows with the text, as its words do, and never shrinks to make room (Q16). */}
      <AppSymbol
        name={icon}
        size={ICON}
        tintColor={colour}
        style={{ flexShrink: 0 }}
      />
      <AppText variant="action" className={destructive ? 'shrink text-destructive' : 'shrink text-text'} accessible={false}>
        {shown}
      </AppText>
    </Pressable>
  );
}

/** Asks once, with Android's own dialog, before deleting the Account for good (P18, Q32). */
function confirmDelete(deleteAccount: () => Promise<void>) {
  Alert.alert('Delete your account and everything in it?', "This can't be undone.", [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Delete', style: 'destructive', onPress: () => void deleteAccount() },
  ]);
}

/**
 * The Account sheet (P17): who is signed in, Manage Feeds (D17), then Sign out and Delete account
 * last, behind a divider (Q32).
 */
function AccountSheetContent({ onClose }: { onClose: () => void }) {
  const { account, signOut, signingOut, deleteAccount, deletion } = useAuth();
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
      <SheetRow
        label="Delete account"
        busyLabel="Deleting account"
        busy={deletion === 'deleting'}
        tone="destructive"
        icon={{ ios: 'trash', android: 'delete' }}
        onPress={() => confirmDelete(deleteAccount)}
      />
      {deletion === 'failed' ? (
        // Nothing was deleted and the User is still signed in: say so, and what to do (P18).
        <AppText variant="label" role="alert" className="px-edge text-text">
          Couldn&apos;t delete your account. Check your connection and try again.
        </AppText>
      ) : null}
    </View>
  );
}

/**
 * The account circle at the top right of Feeds (P17): the User's initial in D5's
 * "yours" Gold, on a soft face (D27). Tapping it opens the Account sheet.
 * `initiallyOpen` is for the state gallery's open-sheet worlds.
 */
export function AccountButton({ initiallyOpen = false }: { initiallyOpen?: boolean }) {
  const { account } = useAuth();
  const [open, setOpen] = useState(initiallyOpen);
  const close = () => setOpen(false);
  // Grows with the initial inside it, so large text never outgrows the circle (Q16).
  const size = CIRCLE * useSizeScale();

  return (
    <>
      <DepthPressable
        level="soft"
        role="button"
        aria-label={account ? `Account, ${account.name ?? account.email}` : 'Account'}
        onPress={() => setOpen(true)}
        // With the hit slop the target reaches 48 dp (Q15).
        hitSlop={spacing.related}
        // A soft object like the chips beside it (D27), its Gold initial saying "yours" (D5).
        className="items-center justify-center rounded-full"
        style={{ width: size, height: size }}
      >
        {account ? (
          <AppText variant="label" className="text-accent" accessible={false}>
            {account.initial}
          </AppText>
        ) : null}
      </DepthPressable>
      <NativeSheet open={open} onClose={close}>
        <AccountSheetContent onClose={close} />
      </NativeSheet>
    </>
  );
}
