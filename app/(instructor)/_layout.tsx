import { Redirect, Stack } from 'expo-router';
import { View } from 'react-native';
import { MakeupInbox } from '../../src/MakeupInbox';
import { useStore } from '../../src/store';
import { colors } from '../../src/theme';
import { Loading } from '../../src/ui';

export default function InstructorLayout() {
  const { ready, user } = useStore();
  if (!ready) return <Loading />;
  if (!user) return <Redirect href="/auth" />;
  if (user.role !== 'instructor') return <Redirect href="/(student)" />;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <MakeupInbox />
      <View style={{ flex: 1 }}>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="students" />
          <Stack.Screen name="student" />
          <Stack.Screen name="feedback" />
        </Stack>
      </View>
    </View>
  );
}
