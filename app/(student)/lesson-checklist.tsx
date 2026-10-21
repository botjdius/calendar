import { useLocalSearchParams, useRouter } from 'expo-router';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LessonHomeworkChecklist } from '../../src/LessonHomeworkChecklist';
import { LessonReadingSection } from '../../src/LessonReadingSection';
import { lessonChecklistItems } from '../../src/lessonChecklist';
import { formatTime12, sessionLabel } from '../../src/schedule';
import { timeLabel } from '../../src/MonthCal';
import { ScrollPad } from '../../src/ScrollPad';
import { useStore } from '../../src/store';
import { useSessionChecklist } from '../../src/useSessionChecklist';
import { colors } from '../../src/theme';
import type { LessonSession, Student } from '../../src/types';
import { Button, Card, Screen } from '../../src/ui';

function pickSession(sessions: LessonSession[], sessionId?: string): LessonSession | undefined {
  if (sessionId) return sessions.find((s) => s.id === sessionId);
  const withNote = sessions.filter((s) => s.note.trim() || lessonChecklistItems(s.note).length > 0);
  return withNote[withNote.length - 1] ?? sessions[sessions.length - 1];
}

function LessonChecklistBody({ student, session }: { student: Student; session: LessonSession }) {
  const router = useRouter();
  const { setChecklistItem } = useStore();
  const { checkedIds, toggleItem, syncing } = useSessionChecklist({
    studentId: student.id,
    sessionId: session.id,
    cloudChecked: session.checklistChecked,
    setChecklistItem,
  });

  return (
    <ScrollView contentContainerStyle={{ flexGrow: 1, paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
      <Screen
        title="레슨 내용 및 숙제 체크리스트"
        subtitle={`${sessionLabel(session)} · ${timeLabel(session.date)} ${formatTime12(session.time)}`}
      >
        <Card>
          <Text style={{ fontSize: 18, fontWeight: '900', color: colors.ink, marginBottom: 10 }}>오늘의 레슨 내용</Text>
          <LessonReadingSection note={session.note} />
        </Card>

        <Card style={{ marginTop: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <Text style={{ fontSize: 18, fontWeight: '900', color: colors.ink }}>숙제 체크리스트</Text>
            {syncing ? <Text style={{ color: colors.muted, fontSize: 12, fontWeight: '700' }}>저장 중…</Text> : null}
          </View>
          <LessonHomeworkChecklist
            note={session.note}
            checkedIds={checkedIds}
            onToggleItem={(itemId, checked) => void toggleItem(itemId, checked)}
          />
        </Card>

        <View style={{ marginTop: 16 }}>
          <Button tone="ghost" label="내 레슨으로 돌아가기" onPress={() => router.back()} />
        </View>
        <ScrollPad />
      </Screen>
    </ScrollView>
  );
}

export default function LessonChecklistScreen() {
  const router = useRouter();
  const rawSessionId = useLocalSearchParams<{ sessionId?: string | string[] }>().sessionId;
  const sessionId = Array.isArray(rawSessionId) ? rawSessionId[0] : rawSessionId;
  const { myStudent } = useStore();

  if (!myStudent) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top', 'bottom']}>
        <Screen title="레슨 내용 및 숙제 체크리스트" subtitle="레슨 카드가 연결되면 이용할 수 있습니다.">
          <Card>
            <Text style={{ color: colors.muted }}>표시할 레슨이 없습니다.</Text>
          </Card>
          <Button tone="ghost" label="돌아가기" onPress={() => router.back()} />
        </Screen>
      </SafeAreaView>
    );
  }

  const session = pickSession(myStudent.sessions, sessionId);
  if (!session) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top', 'bottom']}>
        <Screen title="레슨 내용 및 숙제 체크리스트">
          <Card>
            <Text style={{ color: colors.muted }}>회차를 찾을 수 없습니다.</Text>
          </Card>
          <Button tone="ghost" label="내 레슨으로" onPress={() => router.replace('/(student)')} />
        </Screen>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top', 'bottom']}>
      <LessonChecklistBody student={myStudent} session={session} />
    </SafeAreaView>
  );
}
