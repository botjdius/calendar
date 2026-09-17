import { useRouter } from 'expo-router';
import { ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MakeupHistory } from '../../../src/MakeupHistory';
import { ScrollPad } from '../../../src/ScrollPad';
import { useStore } from '../../../src/store';
import { colors } from '../../../src/theme';
import { Screen } from '../../../src/ui';

export default function InstructorMakeupHistory() {
  const { requests, reviseMakeup, removeMakeupHistory } = useStore();
  const router = useRouter();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
        <Screen
          title="보강 내역"
          subtitle="달력 탭의 실시간 신청은 그대로 두고, 이미 수락하거나 거절한 보강만 모아 수정·철회·삭제합니다."
        >
          <MakeupHistory
            requests={requests}
            onRevise={reviseMakeup}
            onRemove={removeMakeupHistory}
            onOpenStudent={(id) => router.push(`/(instructor)/student/${id}`)}
          />
          <ScrollPad />
        </Screen>
      </ScrollView>
    </SafeAreaView>
  );
}
