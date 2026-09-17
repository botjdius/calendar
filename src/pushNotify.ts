import { notifyCloudPush } from './cloudPush';
import type { MakeupRequest } from './types';

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

export function notifyRemotePush(
  payload: Parameters<typeof notifyCloudPush>[0]
) {
  void notifyCloudPush(payload);
}
