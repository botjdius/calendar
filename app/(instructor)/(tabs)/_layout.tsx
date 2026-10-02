import { Tabs } from 'expo-router';
import { Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, tabBarBottomGap } from '../../../src/theme';

export default function InstructorTabs() {
  const insets = useSafeAreaInsets();
  return (
    <Tabs
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.pine,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: {
          backgroundColor: colors.paper,
          borderTopColor: colors.line,
          height: Platform.OS === 'web' ? 94 : 86 + insets.bottom,
          paddingBottom: (Platform.OS === 'web' ? 0 : insets.bottom) + tabBarBottomGap,
          paddingTop: 8,
        },
        tabBarItemStyle: {
          minWidth: 0,
          marginVertical: 8,
          borderLeftWidth: route.name === 'index' ? 0 : 1,
          borderLeftColor: colors.line,
        },
        tabBarLabelPosition: 'beside-icon',
        tabBarAllowFontScaling: false,
        tabBarIcon: () => null,
        tabBarIconStyle: { display: 'none' },
        tabBarLabelStyle: { fontSize: 13, lineHeight: 18, fontWeight: '700', margin: 0, marginStart: 0, marginEnd: 0 },
      })}
    >
      <Tabs.Screen name="index" options={{ title: '레슨' }} />
      <Tabs.Screen name="timetable" options={{ href: null }} />
      <Tabs.Screen name="board" options={{ title: '달력' }} />
      <Tabs.Screen name="makeup" options={{ title: '보강내역' }} />
      <Tabs.Screen name="settings" options={{ title: '설정' }} />
    </Tabs>
  );
}
