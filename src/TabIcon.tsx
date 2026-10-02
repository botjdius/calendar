import { SymbolView } from 'expo-symbols';
import type { ColorValue } from 'react-native';

const ICONS = {
  home: { ios: 'house', android: 'home', web: 'home' },
  lessons: { ios: 'checklist', android: 'checklist', web: 'checklist' },
  calendar: { ios: 'calendar', android: 'calendar_month', web: 'calendar_month' },
  makeup: { ios: 'arrow.triangle.2.circlepath', android: 'event_repeat', web: 'event_repeat' },
  settings: { ios: 'gearshape', android: 'settings', web: 'settings' },
} as const;

export type TabIconName = keyof typeof ICONS;

export function tabIcon(name: TabIconName) {
  return function TabBarIcon({ color, size }: { color: ColorValue; size: number }) {
    return <SymbolView name={ICONS[name]} tintColor={color} size={size} />;
  };
}
