import { ScrollView, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PublicCalendar } from '../../src/PublicCalendar';
import { useStore } from '../../src/store';
import { colors } from '../../src/theme';
import { Card, Screen } from '../../src/ui';

export default function StudentBoard() {
  const { closures, openSlots, requests, myStudent, requestMakeup, changeMakeup, withdrawMakeup } = useStore();
  if (!myStudent) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
        <ScrollView contentContainerStyle={{ flexGrow: 1, paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
          <Screen title="달력" subtitle="연결된 레슨 카드가 없습니다.">
            <Card>
              <Text style={{ color: colors.muted }}>
                레슨생 카드가 삭제된 뒤에는 달력·휴강·보강 업데이트를 볼 수 없습니다.
              </Text>
            </Card>
          </Screen>
        </ScrollView>
      </SafeAreaView>
    );
  }
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
        <PublicCalendar
          closures={closures}
          openSlots={openSlots}
          requests={requests}
          myStudent={myStudent}
          onRequestMakeup={requestMakeup}
          onChangeMakeup={changeMakeup}
          onWithdrawMakeup={withdrawMakeup}
        />
      </ScrollView>
    </SafeAreaView>
  );
}
