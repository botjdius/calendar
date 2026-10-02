import { Alert, Platform, ScrollView, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScrollPad } from '../../src/ScrollPad';
import { StudentFeedbackBox } from '../../src/StudentFeedbackBox';
import { useStore } from '../../src/store';
import { colors } from '../../src/theme';
import { AccountCopy, Button, Card, Fold, Screen } from '../../src/ui';
import { WebPushSettings } from '../../src/WebPushSettings';

export default function StudentSettings() {
  const { bank, banks, signOut, deleteMyAccount, sendFeedback } = useStore();

  function confirmLeave() {
    const go = () => {
      deleteMyAccount().catch(() => {});
    };
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.confirm('레슨생 계정을 탈퇴할까요?')) go();
      return;
    }
    Alert.alert('탈퇴', '레슨생 계정이 삭제됩니다.', [
      { text: '취소', style: 'cancel' },
      { text: '탈퇴', style: 'destructive', onPress: go },
    ]);
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
        <Screen title="설정" subtitle="입금 계좌와 익명 피드백, 로그아웃을 모았습니다.">
          <Card>
            <Text style={{ fontWeight: '800', fontSize: 16, color: colors.ink, marginBottom: 8 }}>입금 계좌</Text>
            <AccountCopy bank={bank} banks={banks} embedded />
          </Card>
          <Card>
            <Fold title="익명 피드백 보내기" plainTitle>
              <StudentFeedbackBox onSend={sendFeedback} />
            </Fold>
          </Card>
          <WebPushSettings />
          <Button tone="wine" label="로그아웃" onPress={() => signOut()} />
          <Button tone="ghost" label="탈퇴" onPress={confirmLeave} />
          <ScrollPad />
        </Screen>
      </ScrollView>
    </SafeAreaView>
  );
}
