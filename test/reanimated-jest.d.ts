// Reanimated declares its Jest matcher (`toHaveAnimatedStyle`) and `getAnimatedStyle(component)`
// only in its native typings, which TypeScript doesn't pick for this project. This brings them in
// for tests (FEE-33).
import type {} from 'react-native-reanimated/lib/typescript/jestUtils/index.native';
