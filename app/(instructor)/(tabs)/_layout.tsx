import { Tabs } from 'expo-router';
import { Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../../../src/theme';

export default function InstructorTabs() {
  const insets = useSafeAreaInsets();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.pine,
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
      <Tabs.Screen name="index" options={{ title: '레슨' }} />
      <Tabs.Screen name="timetable" options={{ href: null }} />
      <Tabs.Screen name="board" options={{ title: '달력' }} />
      <Tabs.Screen name="makeup" options={{ title: '보강내역' }} />
      <Tabs.Screen name="settings" options={{ title: '설정' }} />
    </Tabs>
  );
}
