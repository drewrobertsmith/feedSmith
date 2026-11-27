// Reanimated runs for real under Jest (FEE-33): its own resolver (package.json `jest.resolver`)
// loads its web initializers instead of the native ones, and this adds its matchers
// (`toHaveAnimatedStyle`) and fake-timer support.
require('react-native-reanimated').setUpTests();
// Expo Router's testing library would swap them back for mocks: its mocks file, without those two.
jest.mock('expo-router/build/testing-library/mocks', () => require('./expo-router-test-mocks'));

// The chip switch (FEE-42) is a plain wrapper in tests that shows which chip's rows are shown.
// Reanimated itself runs for real now (FEE-33); this double stays because the Feeds tests read
// its `index`, and can move to the real slide with `toHaveAnimatedStyle` when they're next reworked.
jest.mock('@/components/chip-switch', () => {
  const { View } = require('react-native');
  return {
    // `index` shows which chip the rows slide for.
    ChipSwitch: ({ index, children }) => (
      <View testID="chip-switch" index={index}>
        {children}
      </View>
    ),
    SlideRow: ({ children }) => children,
    // The rows switch at once here; the real hook's timing is tested on its own (chip-switch.test.tsx).
    useChipSwitch: (shown) => ({ shown, slide: null }),
  };
});

// Android's bottom sheet is Jetpack Compose (Expo UI), which has no Jest renderer: its one
// adapter shows its content while open, as the real sheet does (FEE-35).
jest.mock('@/components/native-sheet', () => ({
  NativeSheet: jest.fn(({ open, children }) => (open ? children : null)),
}));

// Asking first is Compose's AlertDialog too (FEE-49): while open, its adapter shows the question and its two
// buttons, Cancel then the confirming one, as TalkBack hears them.
jest.mock('@/components/confirm-dialog', () => {
  const { Pressable, Text, View } = jest.requireActual('react-native');
  return {
    ConfirmDialog: jest.fn(({ open, title, message, confirmLabel, onConfirm, onCancel }) =>
      open ? (
        <View accessible role="alertdialog" aria-label={title}>
          <Text role="heading">{title}</Text>
          <Text>{message}</Text>
          <Pressable role="button" aria-label="Cancel" onPress={onCancel} />
          <Pressable role="button" aria-label={confirmLabel} onPress={onConfirm} />
        </View>
      ) : null,
    ),
  };
});

// Android's own menu is Compose too (FEE-97): its adapter shows the trigger, and while open, each
// action as a menu item named by its label.
jest.mock('@/components/native-menu', () => {
  const { Pressable, Text, View } = jest.requireActual('react-native');
  return {
    NativeMenu: jest.fn(({ open, onClose, actions, children }) => (
      <View>
        {children}
        {open
          ? actions.map((action) => (
              <Pressable
                key={action.label}
                role="menuitem"
                aria-label={action.label}
                onPress={() => {
                  onClose();
                  action.onPress();
                }}
              >
                <Text>{action.label}</Text>
              </Pressable>
            ))
          : null}
      </View>
    )),
  };
});

// Android's own text field is Compose too (FEE-43): its adapter here is React Native's field, with
// the same uncontrolled interface: a starting value, each change reported, Done submits.
jest.mock('@/components/native-text-field', () => {
  const { TextInput } = jest.requireActual('react-native');
  return {
    NativeTextField: ({ label, placeholder, defaultValue, onChangeText, onSubmitEditing, editable }) => (
      <TextInput
        aria-label={label}
        placeholder={placeholder}
        defaultValue={defaultValue}
        onChangeText={onChangeText}
        onSubmitEditing={onSubmitEditing}
        editable={editable}
      />
    ),
  };
});

// expo-sqlite's key-value store is native; tests keep places in memory, and the app's own store reads nothing (FEE-130).
jest.mock('expo-sqlite/kv-store', () => ({ Storage: { getItemSync: () => null, setItemSync: () => {} } }));

// The Sentry SDK ships ESM that Jest can't load, and has nothing to send to here. Breadcrumbs from the
// adapters (`trail`, FEE-137) go nowhere; a test that checks what reaches Sentry mocks it itself.
jest.mock('@sentry/react-native', () => ({ addBreadcrumb: jest.fn(), setUser: jest.fn() }));

// A build embeds its app config, version included; Jest's doesn't. The Account sheet names the version (FEE-140).
jest.mock('expo-constants', () => {
  const actual = jest.requireActual('expo-constants');
  const constants = actual.default;
  const expoConfig = { ...constants.expoConfig, version: require('../app.json').expo.version };
  return { ...actual, __esModule: true, default: new Proxy(constants, { get: (target, key) => (key === 'expoConfig' ? expoConfig : target[key]) }) };
});
