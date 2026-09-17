import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { IosSafariGap } from '../src/IosSafariGap';
import { StoreProvider } from '../src/store';
import { colors } from '../src/theme';
import { WebPushListener } from '../src/WebPushListener';

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.bg }}>
      <SafeAreaProvider>
        <StoreProvider>
          <IosSafariGap />
          <WebPushListener />
          <StatusBar style="dark" />
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }} />
        </StoreProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
