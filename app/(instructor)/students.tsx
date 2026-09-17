import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScrollPad } from '../../src/ScrollPad';
import { StudentRosterList } from '../../src/StudentRosterList';
import { useStore } from '../../src/store';
import { colors } from '../../src/theme';
import type { Student } from '../../src/types';
import { Button, Screen } from '../../src/ui';

export default function StudentRoster() {
  const { students, removeStudent } = useStore();
  const router = useRouter();
  const [askDelete, setAskDelete] = useState<Student | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const list = useMemo(() => students, [students]);

  async function confirmDelete() {
    if (!askDelete || busy) return;
    setBusy(true);
    setError('');
    try {
      await removeStudent(askDelete.id);
      setAskDelete(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : '레슨생을 삭제하지 못했습니다.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
        <Screen
          title="등록 레슨생"
          subtitle="요일·시간 순입니다. 이름을 누르면 레슨 상세로 가고, 우클릭(휴대폰은 길게 누르기)하면 삭제 창이 열립니다."
        >
          <Button tone="ghost" label="설정으로" onPress={() => router.back()} />
          <StudentRosterList
            students={list}
            askDelete={askDelete}
            busy={busy}
            error={error}
            onOpen={(id) => {
              if (askDelete) return;
              router.push({ pathname: '/(instructor)/student/[id]', params: { id } });
            }}
            onAskDelete={(student) => {
              setError('');
              setAskDelete(student);
            }}
            onCancel={() => {
              setAskDelete(null);
              setError('');
            }}
            onConfirm={() => {
              void confirmDelete();
            }}
          />
          <ScrollPad />
        </Screen>
      </ScrollView>
    </SafeAreaView>
  );
}
