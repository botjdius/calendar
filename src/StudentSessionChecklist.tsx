import { useRouter } from 'expo-router';
import { LessonContentView } from './LessonContentView';
import { lessonChecklistProgress } from './lessonChecklist';
import { useSessionChecklist } from './useSessionChecklist';
import { useStore } from './store';
import type { LessonSession, Student } from './types';
import { Button } from './ui';

type Props = {
  student: Student;
  session: LessonSession;
};

export function StudentSessionChecklist({ student, session }: Props) {
  const router = useRouter();
  const { setChecklistItem } = useStore();
  const { checkedIds, toggleItem } = useSessionChecklist({
    studentId: student.id,
    sessionId: session.id,
    cloudChecked: session.checklistChecked,
    setChecklistItem,
  });
  const progress = lessonChecklistProgress(session.note, checkedIds);

  return (
    <>
      <LessonContentView
        note={session.note}
        checkedIds={checkedIds}
        interactive
        onToggleItem={(itemId, checked) => void toggleItem(itemId, checked)}
      />
      {session.note.trim() || progress.total > 0 ? (
        <Button
          tone="clay"
          label={`레슨 내용 및 숙제 체크리스트 · ${
            progress.total > 0 ? `숙제 ${progress.done}/${progress.total}` : '수업 내용 보기'
          }`}
          onPress={() =>
            router.push({
              pathname: '/(student)/lesson-checklist',
              params: { sessionId: session.id },
            })
          }
        />
      ) : null}
    </>
  );
}
