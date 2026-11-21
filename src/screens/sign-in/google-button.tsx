import { Image } from 'expo-image';
import { ActivityIndicator, Pressable, Text } from 'react-native';

import { useEnvironment } from '@/environment';
import { googleButton } from '@/theme/google';

const { layout, label } = googleButton;

/** Google's own "Sign in with Google" button (D10). Busy while sign-in is underway. */
export function GoogleSignInButton({ busy, onPress }: { busy: boolean; onPress: () => void }) {
  const { colorScheme } = useEnvironment();
  const colors = googleButton[colorScheme];

  return (
    <Pressable
      role="button"
      aria-label="Sign in with Google"
      aria-disabled={busy}
      aria-busy={busy}
      disabled={busy}
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: layout.gap,
        minHeight: layout.height,
        borderRadius: layout.radius,
        borderWidth: 1,
        paddingHorizontal: layout.paddingHorizontal,
        backgroundColor: colors.background,
        borderColor: colors.border,
        opacity: pressed ? 0.88 : 1,
      })}
    >
      {busy ? (
        <ActivityIndicator size={layout.logo} color={colors.label} />
      ) : (
        <Image source={require('../../../assets/images/google-g.svg')} style={{ width: layout.logo, height: layout.logo }} />
      )}
      <Text style={{ ...label, color: colors.label }}>Sign in with Google</Text>
    </Pressable>
  );
}
