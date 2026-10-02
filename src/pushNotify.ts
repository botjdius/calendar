import { notifyCloudPush } from './cloudPush';
import { closureWhenLabel, openSlotWhenLabel, studentsAffectedByClosure, studentsEligibleForOpenSlot } from './schedule';
import type { Closure, MakeupRequest, OpenSlot, Student } from './types';

type MakeupPush = Pick<MakeupRequest, 'id' | 'studentId' | 'studentName' | 'date' | 'time' | 'intent'>;

export function makeupInstructorPush(req: MakeupPush) {
  const when = [req.date, req.time].filter(Boolean).join(' ');
  return {
    audience: 'instructors' as const,
    title: req.intent === 'withdraw' ? '보강 철회' : req.intent === 'change' ? '보강 변경' : '보강 신청',
    body: `${req.studentName || '레슨생'}${when ? ` · ${when}` : ''}`,
    url: `/student/${req.studentId}`,
    tag: `makeup-${req.id}`,
  };
}

export function makeupStudentPush(req: Pick<MakeupRequest, 'id' | 'studentId'>, title: string, body: string) {
  return {
    audience: 'student' as const,
    studentId: req.studentId,
    title,
    body,
    url: '/',
    tag: `makeup-${req.id}`,
  };
}

export function feedbackInstructorPush() {
  return {
    audience: 'instructors' as const,
    title: '새 피드백',
    body: '레슨생 피드백이 도착했습니다.',
    url: '/',
    tag: 'feedback-new',
  };
}

export function openSlotStudentsPush(
  slot: Pick<OpenSlot, 'id' | 'date' | 'startTime' | 'endTime'>,
  students: Pick<Student, 'id' | 'linkedUid'>[]
) {
  const when = openSlotWhenLabel(slot);
  return {
    audience: 'students' as const,
    studentIds: students.map((student) => student.id),
    linkedUids: students.map((student) => student.linkedUid).filter((uid): uid is string => Boolean(uid)),
    title: '새 보강 시간',
    body: when ? `${when}에 보강 신청할 수 있습니다.` : '보강 신청할 수 있는 빈 시간이 등록됐습니다.',
    url: '/board',
    tag: `open-slot-${slot.id}`,
  };
}

export function notifyOpenSlotStudents(
  slot: Pick<OpenSlot, 'id' | 'date' | 'startTime' | 'endTime'>,
  students: Pick<Student, 'id' | 'sessions' | 'linkedUid'>[]
) {
  const eligible = studentsEligibleForOpenSlot(students, slot.date);
  if (!eligible.length) return;
  const shared = openSlotStudentsPush(slot, eligible);
  for (const student of eligible) {
    void notifyCloudPush({
      audience: 'student',
      studentId: student.id,
      uid: student.linkedUid || undefined,
      title: shared.title,
      body: shared.body,
      url: shared.url,
      tag: shared.tag,
    });
  }
}

export function closureStudentsPush(
  closure: Pick<Closure, 'id' | 'date' | 'endDate' | 'time' | 'reason'>,
  students: Pick<Student, 'id' | 'linkedUid'>[]
) {
  const when = closureWhenLabel(closure);
  return {
    audience: 'students' as const,
    studentIds: students.map((student) => student.id),
    linkedUids: students.map((student) => student.linkedUid).filter((uid): uid is string => Boolean(uid)),
    title: '휴강 안내',
    body: when ? `${when} 레슨·보강이 휴강입니다.` : '등록된 휴강이 있습니다.',
    url: '/',
    tag: `closure-${closure.id}`,
  };
}

export function notifyClosureStudents(
  closure: Closure,
  students: Pick<Student, 'id' | 'time' | 'sessions' | 'linkedUid'>[]
) {
  const eligible = studentsAffectedByClosure(students, closure);
  if (!eligible.length) return;
  const shared = closureStudentsPush(closure, eligible);
  for (const student of eligible) {
    void notifyCloudPush({
      audience: 'student',
      studentId: student.id,
      uid: student.linkedUid || undefined,
      title: shared.title,
      body: shared.body,
      url: shared.url,
      tag: shared.tag,
    });
  }
}

export function notifyRemotePush(
  payload: Parameters<typeof notifyCloudPush>[0]
) {
  void notifyCloudPush(payload);
}
