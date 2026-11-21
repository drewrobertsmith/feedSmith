import { Image } from 'expo-image';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '@/auth/auth-context';
import { AppText } from '@/components/app-text';
import { GoogleSignInButton } from '@/screens/sign-in/google-button';
import { spacing } from '@/theme/spacing';

/** The mark, at the size of Android's launcher icon art. */
const MARK_SIZE = 96;

const ERRORS = {
  'not-allowed': 'This Google account can’t use feedSmith yet.',
  failed: 'Couldn’t sign in. Check your connection and try again.',
} as const;

/** Signed out: the mark, the name, and one action, signing in with Google. */
export function SignInScreen() {
  const insets = useSafeAreaInsets();
  const { signIn, startSignIn } = useAuth();

  return (
    <View
      className="flex-1 justify-between bg-background px-edge"
      style={{ paddingTop: insets.top + spacing.section, paddingBottom: insets.bottom + spacing.section }}
    >
      <View className="flex-1 justify-center gap-group">
        <Image source={require('../../../assets/images/splash-icon.png')} style={{ width: MARK_SIZE, height: MARK_SIZE }} accessible={false} />
        <View className="gap-related">
          <AppText variant="title">feedSmith</AppText>
          <AppText variant="reading" className="text-text-muted">
            Your feeds, calm and readable.
          </AppText>
        </View>
      </View>
      <View className="gap-related">
        <GoogleSignInButton busy={signIn.status === 'busy'} onPress={startSignIn} />
        {signIn.status === 'error' ? (
          <AppText variant="label" role="alert" className="text-text">
            {ERRORS[signIn.kind]}
          </AppText>
        ) : null}
      </View>
    </View>
  );
}
