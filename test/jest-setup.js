// Reanimated 4.7.1 can't start under Jest (its native initializer calls `setCSSEventHandler`,
// which its JS implementation throws on). The app's one Reanimated adapter is mocked instead;
// tests assert what it receives.
jest.mock('@/environment/motion-config', () => ({ MotionConfig: jest.fn(() => null) }));

// The chip switch's slide needs Reanimated too (FEE-42): it becomes a plain wrapper that shows
// which chip's rows are shown.
jest.mock('@/components/chip-switch', () => {
  const { View } = require('react-native');
  return {
    // The slide can't run here (FEE-33); `index` shows which chip the rows slide for.
    ChipSwitch: ({ index, children }) => (
      <View testID="chip-switch" index={index}>
        {children}
      </View>
    ),
    SlideRow: ({ children }) => children,
  };
});

// The drag gesture needs Reanimated too (D13): its one adapter becomes a plain row whose handle
// carries `onDrop`, so tests drop a row where a drag would.
jest.mock('@/components/drag-row', () => {
  const { View } = require('react-native');
  return {
    DragList: ({ gap, children }) => <View style={{ gap }}>{children}</View>,
    // The gesture can't run here (FEE-33); the handle keeps its TalkBack props, and `onDrop` stands in for a drag.
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
