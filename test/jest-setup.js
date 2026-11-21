// Reanimated 4.7.1 can't start under Jest (its native initializer calls `setCSSEventHandler`,
// which its JS implementation throws on). The app's one Reanimated adapter is mocked instead;
// tests assert what it receives.
jest.mock('@/environment/motion-config', () => ({ MotionConfig: jest.fn(() => null) }));
