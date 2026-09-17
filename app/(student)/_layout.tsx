import { Redirect, Tabs } from 'expo-router';
import { Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Loading } from '../../src/ui';
import { useStore } from '../../src/store';
import { colors } from '../../src/theme';

export default function StudentTabs() {
  const { ready, user } = useStore();
  const insets = useSafeAreaInsets();
  if (!ready) return <Loading />;
  if (!user) return <Redirect href="/auth" />;
  if (user.role !== 'student') return <Redirect href="/(instructor)" />;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.clay,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: {
          backgroundColor: colors.paper,
          borderTopColor: colors.line,
          height: 56 + Math.max(insets.bottom, 12) + (Platform.OS === 'web' ? 28 : 0),
          paddingBottom: Math.max(insets.bottom, 12) + (Platform.OS === 'web' ? 28 : 0),
          paddingTop: 6,
        },
      }}
    >
      <Tabs.Screen name="index" options={{ title: '내 레슨' }} />
      <Tabs.Screen name="board" options={{ title: '달력' }} />
      <Tabs.Screen name="settings" options={{ title: '설정' }} />
    </Tabs>
  );
}
