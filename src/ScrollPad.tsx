import { Platform, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export function scrollBottom(insetBottom = 0) {
  return 120 + insetBottom + (Platform.OS === 'web' ? 72 : 0);
}

export function ScrollPad() {
  const insets = useSafeAreaInsets();
  return <View style={{ height: scrollBottom(insets.bottom) }} />;
}
