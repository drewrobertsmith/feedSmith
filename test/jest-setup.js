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
  };
});

// The drag gesture (D13) is a plain row in tests whose handle
// carries `onDrop`, so tests drop a row where a drag would.
jest.mock('@/components/drag-row', () => {
  const { View } = require('react-native');
  return {
    DragList: ({ gap, children }) => <View style={{ gap }}>{children}</View>,
    // A drag can't be driven through Jest's renderer, so the handle keeps its TalkBack props, and `onDrop` stands in for one.
    DragRow: ({ index, count, handle, handleLabel, onDrop, children }) => (
      <View style={{ flexDirection: 'row' }}>
        <View {...require('@/components/reorder-handle').reorderHandleProps({ index, count, label: handleLabel, onDrop })} onDrop={onDrop}>
          {handle}
        </View>
        <View style={{ flex: 1 }}>{children}</View>
      </View>
    ),
  };
});

// Android's bottom sheet is Jetpack Compose (Expo UI), which has no Jest renderer: its one
// adapter shows its content while open, as the real sheet does (FEE-35).
jest.mock('@/components/native-sheet', () => ({
  NativeSheet: jest.fn(({ open, children }) => (open ? children : null)),
}));

// Android's own text field is Compose too (FEE-43): its adapter here is React Native's field, with
// the same uncontrolled interface: a starting value, each change reported, Done submits.
jest.mock('@/components/native-text-field', () => {
  const { TextInput } = jest.requireActual('react-native');
  return {
    NativeTextField: ({ label, placeholder, defaultValue, onChangeText, onSubmitEditing, editable, maxLength }) => (
      <TextInput
        aria-label={label}
        placeholder={placeholder}
        defaultValue={defaultValue}
        onChangeText={onChangeText}
        onSubmitEditing={onSubmitEditing}
        editable={editable}
        maxLength={maxLength}
      />
    ),
  };
});
