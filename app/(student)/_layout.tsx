import { Redirect, Tabs } from 'expo-router';
import { Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Loading } from '../../src/ui';
import { useStore } from '../../src/store';
import { colors, tabBarBottomGap } from '../../src/theme';

export default function StudentTabs() {
  const { ready, user } = useStore();
  const insets = useSafeAreaInsets();
  if (!ready) return <Loading />;
  if (!user) return <Redirect href="/auth" />;
  if (user.role !== 'student') return <Redirect href="/(instructor)" />;

  return (
    <Tabs
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.clay,
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
      <Tabs.Screen name="index" options={{ title: '내 레슨' }} />
      <Tabs.Screen name="board" options={{ title: '달력' }} />
      <Tabs.Screen name="settings" options={{ title: '설정' }} />
    </Tabs>
  );
}
