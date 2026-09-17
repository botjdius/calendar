import { mergeRemovedStudents } from './cloud.mjs';

export function captureRosterContextMenu(event) {
  event?.preventDefault?.();
  event?.stopPropagation?.();
  event?.nativeEvent?.preventDefault?.();
  event?.nativeEvent?.stopPropagation?.();
  return true;
}

export function rosterDeletePrompt(student) {
  return {
    studentId: student?.id || '',
    title: '레슨생 삭제',
    message: `${student?.name || '레슨생'} 카드를 지울까요? 회차·메모도 함께 사라집니다.`,
    confirmLabel: '삭제',
  };
}

export function requestsForLiveStudents(requests, students) {
  const liveIds = new Set((students || []).map((s) => s.id));
  return (requests || []).filter((r) => liveIds.has(r.studentId));
}

export function applyRemoveStudent(state, studentId, at = new Date().toISOString()) {
  const card = (state.students || []).find((s) => s.id === studentId);
  return {
    students: (state.students || []).filter((s) => s.id !== studentId),
    accounts: (state.accounts || []).filter((a) => a.studentId !== studentId),
    requests: (state.requests || []).filter((r) => r.studentId !== studentId),
    closures: (state.closures || []).filter((c) => c.studentId !== studentId),
    removedStudents: mergeRemovedStudents(state.removedStudents, [
      {
        id: studentId,
        name: card?.name,
        joinCode: card?.joinCode,
        linkedUid: card?.linkedUid || null,
        removedAt: at,
      },
    ]),
  };
}
