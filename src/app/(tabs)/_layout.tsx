import { NativeTabs } from 'expo-router/native-tabs';

import { useEnvironment } from '@/environment';
import { tabBarColors } from '@/navigation/tab-bar-colors';

export default function TabsLayout() {
  const { colorScheme } = useEnvironment();

  return (
    <NativeTabs {...tabBarColors(colorScheme)} labelVisibilityMode="labeled">
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Icon md="article" />
        <NativeTabs.Trigger.Label>Feeds</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="saved">
        <NativeTabs.Trigger.Icon md="bookmark" />
        <NativeTabs.Trigger.Label>Saved</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
