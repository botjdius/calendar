import {
  droppedAttachmentIds,
  externalizeStudents,
  mergeRemovedAttachmentIds,
  mergeSessionAttachments,
  stripDataUriAttachments,
} from './fileCloud.mjs';
import { emptyShared, isEphemeralHubUrl, mergeBanks, packBanks, type SharedBlob } from './hub';
import { mergePushSubscriptions } from './pushStore';
import { mergeMonthlyGoals } from './monthlyGoals';
import { dedupeHolidaySessions } from './schedule';
import type { Account, Announcement, AnonymousFeedback, MakeupRequest, RemovedStudent, Student } from './types';

export const CLOUD_URL =
  process.env.EXPO_PUBLIC_CLOUD_URL || 'https://extendsclass.com/api/json-storage/bin/ebefede';
export const RENTRY_ID = process.env.EXPO_PUBLIC_RENTRY_ID || 'jyangjyang-studio';
export const RENTRY_CODE = process.env.EXPO_PUBLIC_RENTRY_CODE || 'jyangcloud';
const RENTRY_FETCH = `https://rentry.co/api/fetch/${RENTRY_ID}`;
const RENTRY_EDIT = `https://rentry.co/api/edit/${RENTRY_ID}`;
const EXTENDSCLASS_MAX = 90_000;

export const isCloudConfigured = Boolean(CLOUD_URL || RENTRY_ID);

export type StudioCloud = SharedBlob;

const INSTRUCTOR_PEPPER = 'jyang-instructor';
const REQUEST_RANK: Record<string, number> = { withdrawn: 0, declined: 0, pending: 1, accepted: 2 };

export async function hashInstructorPassword(password: string): Promise<string> {
  const payload = `${INSTRUCTOR_PEPPER}:${String(password || '').trim()}`;
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) return '';
  const buf = await subtle.digest('SHA-256', new TextEncoder().encode(payload));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
}

export async function instructorPasswordMatches(
  account: Pick<Account, 'password' | 'passwordHash'>,
  typed: string
): Promise<boolean> {
  const password = String(typed || '').trim();
  if (!password) return false;
  if (account.password && String(account.password).trim() === password) return true;
  if (account.passwordHash) {
    const hash = await hashInstructorPassword(password);
    return Boolean(hash) && hash === account.passwordHash;
  }
  return false;
}

export function mergeById<T extends { id: string }>(
  current: T[] | undefined,
  incoming: T[] | undefined,
  incomingNewer: boolean
): T[] {
  const map = new Map<string, T>();
  for (const item of current || []) {
    if (item?.id) map.set(item.id, item);
  }
  for (const item of incoming || []) {
    if (!item?.id) continue;
    const prev = map.get(item.id);
    if (!prev || incomingNewer) map.set(item.id, item);
  }
  return [...map.values()];
}

export function mergeAnnouncements(
  current?: Announcement[],
  incoming?: Announcement[],
  incomingNewer = false
): Announcement[] {
  const map = new Map<string, Announcement>();
  for (const item of [...(current || []), ...(incoming || [])]) {
    if (!item?.id) continue;
    const prev = map.get(item.id);
    if (!prev) {
      map.set(item.id, item);
      continue;
    }
    if (prev.deletedAt || item.deletedAt) {
      const deleted =
        String(item.deletedAt || '') >= String(prev.deletedAt || '') ? item : prev;
      map.set(item.id, { ...(incomingNewer ? item : prev), ...deleted, deletedAt: deleted.deletedAt });
      continue;
    }
    if (incomingNewer) map.set(item.id, item);
  }
  return [...map.values()];
}

export function mergeRequests(current?: MakeupRequest[], incoming?: MakeupRequest[]): MakeupRequest[] {
  const map = new Map<string, MakeupRequest>();
  for (const item of [...(current || []), ...(incoming || [])]) {
    if (!item?.id) continue;
    const prev = map.get(item.id);
    if (!prev) {
      map.set(item.id, item);
      continue;
    }
    const prevStamp = String(prev.updatedAt || prev.createdAt || '');
    const nextStamp = String(item.updatedAt || item.createdAt || '');
    if (prevStamp !== nextStamp) {
      map.set(item.id, nextStamp >= prevStamp ? item : prev);
      continue;
    }
    const prevRank = REQUEST_RANK[prev.status] ?? 0;
    const nextRank = REQUEST_RANK[item.status] ?? 0;
    if (nextRank !== prevRank) {
      map.set(item.id, nextRank > prevRank ? item : prev);
    } else {
      map.set(item.id, String(item.createdAt || '') >= String(prev.createdAt || '') ? item : prev);
    }
  }
  return [...map.values()].sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
}

export const FEEDBACK_MAX = 2000;

export function sanitizeFeedback(item: unknown): AnonymousFeedback | null {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
  const raw = item as Record<string, unknown>;
  const id = String(raw.id || '').trim();
  const body = String(raw.body || '')
    .replace(/\r\n/g, '\n')
    .trim()
    .slice(0, FEEDBACK_MAX);
  const createdAt = String(raw.createdAt || '').trim();
  if (!id || !body) return null;
  return { id, body, createdAt };
}

export function mergeFeedback(
  current?: AnonymousFeedback[] | unknown[],
  incoming?: AnonymousFeedback[] | unknown[]
): AnonymousFeedback[] {
  const map = new Map<string, AnonymousFeedback>();
  for (const item of [...(current || []), ...(incoming || [])]) {
    const clean = sanitizeFeedback(item);
    if (!clean) continue;
    const prev = map.get(clean.id);
    if (!prev || String(clean.createdAt || '') >= String(prev.createdAt || '')) {
      map.set(clean.id, clean);
    }
  }
  return [...map.values()].sort(
    (a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')) || b.id.localeCompare(a.id)
  );
}

export function mergeRemovedFeedback(current?: string[], incoming?: string[]): string[] {
  const set = new Set<string>();
  for (const id of [...(current || []), ...(incoming || [])]) {
    const clean = String(id || '').trim();
    if (clean) set.add(clean);
  }
  return [...set].sort();
}

export const mergeRemovedRequests = mergeRemovedFeedback;
export const mergeRemovedOpenSlots = mergeRemovedFeedback;

export function dropRemovedFeedback(
  items?: AnonymousFeedback[] | unknown[],
  removed?: string[]
): AnonymousFeedback[] {
  const drop = new Set(mergeRemovedFeedback([], removed));
  return mergeFeedback([], items).filter((item) => !drop.has(item.id));
}

export function dropRemovedRequests(requests?: MakeupRequest[], removed?: string[]): MakeupRequest[] {
  const drop = new Set(mergeRemovedRequests([], removed));
  return (requests || []).filter((item) => item?.id && !drop.has(item.id));
}

export function dropRemovedOpenSlots<T extends { id: string }>(slots?: T[], removed?: string[]): T[] {
  const drop = new Set(mergeRemovedOpenSlots([], removed));
  return (slots || []).filter((item) => item?.id && !drop.has(item.id));
}

export function mergeOpenSlots<T extends { id: string }>(
  current: T[] | undefined,
  incoming: T[] | undefined,
  incomingNewer: boolean
): T[] {
  const map = new Map<string, T>();
  const first = incomingNewer ? current : incoming;
  const second = incomingNewer ? incoming : current;
  for (const item of first || []) {
    if (item?.id) map.set(item.id, item);
  }
  for (const item of second || []) {
    if (item?.id) map.set(item.id, item);
  }
  return [...map.values()];
}

function accountKey(account: Account) {
  if (account.uid) return account.uid;
  if (account.studentId) return `student:${account.studentId}`;
  return `${account.role}:${String(account.name || '').trim().toLowerCase()}`;
}

function publicInstructor(account: Account): Account {
  return {
    uid: account.uid,
    name: account.name,
    role: 'instructor',
    password: '',
    passwordHash: account.passwordHash || '',
  };
}

function mergePublicAccounts(current: Account[] = [], incoming: Account[] = [], incomingNewer: boolean): Account[] {
  const instructors = new Map<string, Account>();
  const students = new Map<string, Account>();

  const take = (list: Account[], prefer: boolean) => {
    for (const account of list || []) {
      if (account.role === 'instructor') {
        const key = accountKey(account);
        const prev = instructors.get(key);
        if (!prev) {
          instructors.set(key, publicInstructor(account));
          continue;
        }
        instructors.set(key, {
          uid: account.uid || prev.uid,
          name: prefer && account.name ? account.name : prev.name,
          role: 'instructor',
          password: '',
          passwordHash: account.passwordHash || prev.passwordHash,
        });
        continue;
      }
      const key = accountKey(account);
      const prev = students.get(key);
      if (!prev || prefer) students.set(key, { ...account, role: 'student' });
    }
  };

  take(current, false);
  take(incoming, incomingNewer);
  return [...instructors.values(), ...students.values()];
}

function sessionStamp(session?: { updatedAt?: string }) {
  return String(session?.updatedAt || '');
}

function mergeText(preferred: string | undefined, fallback: string | undefined) {
  const next = String(preferred || '');
  const prev = String(fallback || '');
  return next || prev;
}

function normalizeChecklistIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return [...new Set(raw.map((id) => String(id || '').trim()).filter(Boolean))].sort();
}

function mergeSessionChecklistChecked(
  newer: string[] | undefined,
  older: string[] | undefined
): string[] {
  if (newer !== undefined) return normalizeChecklistIds(newer);
  if (older !== undefined) return normalizeChecklistIds(older);
  return [];
}

export function mergeRemovedSessionIds(current?: string[], incoming?: string[]): string[] {
  return [
    ...new Set(
      [...(current || []), ...(incoming || [])]
        .map((id) => String(id || '').trim())
        .filter(Boolean)
    ),
  ].sort();
}

function dropRemovedSessions(student: Student): Student {
  const removedSessionIds = mergeRemovedSessionIds([], student.removedSessionIds);
  const removed = new Set(removedSessionIds);
  return {
    ...student,
    sessions: dedupeHolidaySessions(
      (student.sessions || []).filter(
        (session) => session?.id && !removed.has(session.id)
      )
    ),
    removedSessionIds,
  };
}

function mergeStudent(prev: Student, incoming: Student, incomingNewer: boolean): Student {
  const preferIncoming = incomingNewer;
  const removedSessionIds = mergeRemovedSessionIds(
    prev.removedSessionIds,
    incoming.removedSessionIds
  );
  const removedSessions = new Set(removedSessionIds);
  const sessions = new Map<string, Student['sessions'][number]>();
  for (const session of prev.sessions || []) {
    if (session?.id && !removedSessions.has(session.id)) sessions.set(session.id, session);
  }
  for (const session of incoming.sessions || []) {
    if (!session?.id || removedSessions.has(session.id)) continue;
    const older = sessions.get(session.id);
    if (!older) {
      sessions.set(session.id, session);
      continue;
    }
    const incomingWins =
      sessionStamp(session) !== sessionStamp(older)
        ? sessionStamp(session) >= sessionStamp(older)
        : preferIncoming;
    const newer = incomingWins ? session : older;
    const other = incomingWins ? older : session;
    const removedAttachmentIds = mergeRemovedAttachmentIds(
      newer.removedAttachmentIds,
      other.removedAttachmentIds,
      droppedAttachmentIds(newer.attachments, other.attachments)
    );
    const mergedSession = {
      ...other,
      ...newer,
      note: mergeText(newer.note, other.note),
      studentNote: mergeText(newer.studentNote, other.studentNote),
      checklistChecked: mergeSessionChecklistChecked(newer.checklistChecked, other.checklistChecked),
      attachments: mergeSessionAttachments(newer.attachments, other.attachments, removedAttachmentIds),
      makeup: incomingWins
        ? session.makeup !== undefined
          ? session.makeup
          : older.makeup
        : older.makeup !== undefined
          ? older.makeup
          : session.makeup,
      updatedAt: sessionStamp(newer) || sessionStamp(other) || undefined,
    };
    if (removedAttachmentIds.length) mergedSession.removedAttachmentIds = removedAttachmentIds;
    else delete mergedSession.removedAttachmentIds;
    sessions.set(session.id, mergedSession);
  }
  const preferred = preferIncoming ? incoming : prev;
  const other = preferIncoming ? prev : incoming;
  return {
    ...other,
    ...preferred,
    linkedUid: preferred.linkedUid || other.linkedUid,
    joinCode: preferred.joinCode || other.joinCode,
    sessions: dedupeHolidaySessions([...sessions.values()]),
    removedSessionIds,
    monthlyGoals: mergeMonthlyGoals(preferred.monthlyGoals, other.monthlyGoals, preferIncoming),
  };
}

export function mergeStudents(
  current: Student[] | undefined,
  incoming: Student[] | undefined,
  incomingNewer: boolean
): Student[] {
  const map = new Map<string, Student>();
  for (const student of current || []) {
    if (student?.id) map.set(student.id, dropRemovedSessions(student));
  }
  for (const student of incoming || []) {
    if (!student?.id) continue;
    const prev = map.get(student.id);
    map.set(
      student.id,
      prev ? mergeStudent(prev, student, incomingNewer) : dropRemovedSessions(student)
    );
  }
  return [...map.values()];
}

export function applyStudentWrite(
  base: Student[] | undefined,
  before: Student[] | undefined,
  next: Student[] | undefined
): Student[] {
  if (!next) return base || [];
  if (!base?.length) return next;
  const changed = new Set<string>();
  const beforeMap = new Map((before || []).map((student) => [student.id, student]));
  const stamped = next.map((student) => {
    const prev = beforeMap.get(student.id);
    if (!prev || JSON.stringify(prev) !== JSON.stringify(student)) changed.add(student.id);
    if (!prev) return student;
    return {
      ...student,
      sessions: (student.sessions || []).map((session) => {
        const old = (prev.sessions || []).find((item) => item.id === session.id);
        if (!old || JSON.stringify(old) === JSON.stringify(session)) return session;
        return { ...session, updatedAt: session.updatedAt || new Date().toISOString() };
      }),
    };
  });
  const map = new Map((base || []).map((student) => [student.id, student]));
  for (const student of stamped) {
    if (!changed.has(student.id)) continue;
    const current = map.get(student.id);
    map.set(student.id, current ? mergeStudent(current, student, true) : student);
  }
  return [...map.values()];
}

export function mergeRemovedStudents(
  current?: RemovedStudent[],
  incoming?: RemovedStudent[]
): RemovedStudent[] {
  const map = new Map<string, RemovedStudent>();
  for (const item of [...(current || []), ...(incoming || [])]) {
    if (!item?.id) continue;
    const prev = map.get(item.id);
    if (!prev) {
      map.set(item.id, {
        id: item.id,
        name: item.name,
        joinCode: item.joinCode,
        linkedUid: item.linkedUid ?? null,
        removedAt: item.removedAt || new Date().toISOString(),
      });
      continue;
    }
    const earlier =
      String(prev.removedAt || '') && String(item.removedAt || '') && String(item.removedAt) < String(prev.removedAt)
        ? item
        : prev;
    map.set(item.id, {
      id: item.id,
      name: earlier.name || item.name || prev.name,
      joinCode: earlier.joinCode || item.joinCode || prev.joinCode,
      linkedUid: earlier.linkedUid || item.linkedUid || prev.linkedUid || null,
      removedAt: String(prev.removedAt || '') <= String(item.removedAt || '') ? prev.removedAt : item.removedAt,
    });
  }
  return [...map.values()];
}

export function isStudentRemoved(
  removed: RemovedStudent[] | undefined,
  probe: { id?: string; studentId?: string; uid?: string; linkedUid?: string | null; joinCode?: string; password?: string }
): boolean {
  return (removed || []).some(
    (item) =>
      (probe.id && item.id === probe.id) ||
      (probe.studentId && item.id === probe.studentId) ||
      (probe.uid && item.linkedUid && item.linkedUid === probe.uid) ||
      (probe.linkedUid && item.linkedUid && item.linkedUid === probe.linkedUid)
  );
}

export function normalizeJoinCode(code?: string) {
  return String(code || '').trim().toUpperCase();
}

export function findStudentByJoinCode(students: Student[] | undefined, code: string) {
  const joinCode = normalizeJoinCode(code);
  if (!joinCode) return null;
  return (students || []).find((student) => normalizeJoinCode(student.joinCode) === joinCode) || null;
}

export function unusedJoinCode(students?: Student[], removed?: RemovedStudent[]) {
  const taken = new Set(
    [...(students || []), ...(removed || [])]
      .map((item) => normalizeJoinCode(item.joinCode))
      .filter(Boolean)
  );
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  for (let i = 0; i < 80; i++) {
    const code = Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
    if (!taken.has(code)) return code;
  }
  return `${Date.now().toString(36).slice(-6).toUpperCase()}`;
}

export function resolveStudentJoin(
  localStudents: Student[] | undefined,
  cloudStudents: Student[] | undefined,
  localRemoved?: RemovedStudent[],
  cloudRemoved?: RemovedStudent[],
  code = '',
  cloudNewer = true
) {
  const removed = mergeRemovedStudents(localRemoved, cloudRemoved);
  const roster = liveStudents(mergeStudents(localStudents, cloudStudents || [], cloudNewer), removed);
  const card = findStudentByJoinCode(roster, code);
  return { card, roster, removed };
}

export function liveStudents(students: Student[] | undefined, removed?: RemovedStudent[]): Student[] {
  return (students || []).filter((student) => !isStudentRemoved(removed, student));
}

export function announcementsForStudent<T extends { studentIds?: string[]; createdAt?: string; expiresOn?: string; deletedAt?: string }>(
  announcements: T[] | undefined,
  studentId?: string,
  onDate?: string
): T[] {
  if (!studentId) return [];
  return (announcements || []).filter((item) => {
    if (item.deletedAt) return false;
    if (!(item.studentIds || []).includes(studentId)) return false;
    if (!onDate) return true;
    const expiresOn = String(item.expiresOn || item.createdAt || '').slice(0, 10);
    return !expiresOn || expiresOn >= onDate;
  });
}

export function dropStudentsMissingFrom(current: Student[] | undefined, incoming: Student[] | undefined): Student[] {
  const liveIds = new Set((incoming || []).map((student) => student.id).filter(Boolean));
  if (!liveIds.size) return current || [];
  return (current || []).filter((student) => liveIds.has(student.id));
}

export function studentSessionRevoked(
  uid: string | null | undefined,
  accounts: Account[] | undefined,
  students: Student[] | undefined,
  removed?: RemovedStudent[]
): boolean {
  if (!uid) return false;
  const acc = (accounts || []).find((account) => account.uid === uid);
  if (acc?.role === 'instructor') return false;
  if (
    isStudentRemoved(removed, {
      uid,
      id: acc?.studentId,
      studentId: acc?.studentId,
      joinCode: acc?.password,
      linkedUid: uid,
    })
  ) {
    return true;
  }
  if (acc?.role === 'student') {
    return !(students || []).some((student) => student.id === acc.studentId || student.linkedUid === uid);
  }
  return false;
}

export function joinCodeBlocked(
  code: string,
  students: Student[] | undefined,
  removed?: RemovedStudent[]
): boolean {
  const joinCode = normalizeJoinCode(code);
  if (!joinCode) return false;
  if (findStudentByJoinCode(students, joinCode)) return false;
  return (removed || []).some((item) => normalizeJoinCode(item.joinCode) === joinCode);
}

function durableHubUrl(url?: string) {
  const clean = String(url || '').replace(/\/$/, '');
  if (!clean || isEphemeralHubUrl(clean)) return '';
  return clean;
}

export function mergeStudio(current: StudioCloud | null, incoming: StudioCloud): StudioCloud {
  if (!current) {
    const removedStudents = mergeRemovedStudents([], incoming.removedStudents);
    const students = liveStudents(incoming.students, removedStudents);
    const liveIds = new Set(students.map((student) => student.id));
    return {
      ...incoming,
      students,
      removedStudents,
      accounts: (incoming.accounts || []).filter(
        (account) => account.role !== 'student' || !isStudentRemoved(removedStudents, account)
      ),
      closures: (incoming.closures || []).filter(
        (item) => item.scope !== 'student' || (item.studentId && liveIds.has(item.studentId))
      ),
      requests: dropRemovedRequests(
        (incoming.requests || []).filter((item) => liveIds.has(item.studentId)),
        incoming.removedRequests
      ),
      announcements: mergeAnnouncements([], incoming.announcements || [], true),
      removedFeedback: mergeRemovedFeedback([], incoming.removedFeedback),
      removedRequests: mergeRemovedRequests([], incoming.removedRequests),
      removedOpenSlots: mergeRemovedOpenSlots([], incoming.removedOpenSlots),
      openSlots: dropRemovedOpenSlots(incoming.openSlots, incoming.removedOpenSlots),
      feedback: dropRemovedFeedback(incoming.feedback, incoming.removedFeedback),
    };
  }
  const incomingNewer = (incoming.version || 0) >= (current.version || 0);
  const removedStudents = mergeRemovedStudents(current.removedStudents, incoming.removedStudents);
  let students = liveStudents(mergeStudents(current.students, incoming.students, incomingNewer), removedStudents);
  if (incomingNewer && (incoming.students || []).length) {
    students = dropStudentsMissingFrom(students, incoming.students);
  }
  const liveIds = new Set(students.map((student) => student.id));
  let accounts = mergePublicAccounts(current.accounts, incoming.accounts, incomingNewer).filter(
    (account) => account.role !== 'student' || !isStudentRemoved(removedStudents, account)
  );
  if (incomingNewer) {
    accounts = accounts.filter((account) => account.role !== 'student' || !account.studentId || liveIds.has(account.studentId));
  }
  const removedOpenSlots = mergeRemovedOpenSlots(current.removedOpenSlots, incoming.removedOpenSlots);
  return {
    version: Math.max(current.version || 0, incoming.version || 0),
    students,
    closures: mergeById(current.closures, incoming.closures, incomingNewer).filter(
      (item) => item.scope !== 'student' || (item.studentId && liveIds.has(item.studentId))
    ),
    openSlots: dropRemovedOpenSlots(
      mergeOpenSlots(current.openSlots, incoming.openSlots, incomingNewer),
      removedOpenSlots
    ),
    requests: dropRemovedRequests(
      mergeRequests(current.requests, incoming.requests).filter((item) => liveIds.has(item.studentId)),
      mergeRemovedRequests(current.removedRequests, incoming.removedRequests)
    ),
    announcements: mergeAnnouncements(current.announcements, incoming.announcements || [], incomingNewer),
    removedFeedback: mergeRemovedFeedback(current.removedFeedback, incoming.removedFeedback),
    removedRequests: mergeRemovedRequests(current.removedRequests, incoming.removedRequests),
    removedOpenSlots,
    feedback: dropRemovedFeedback(
      mergeFeedback(current.feedback, incoming.feedback),
      mergeRemovedFeedback(current.removedFeedback, incoming.removedFeedback)
    ),
    ...mergeBanks(incomingNewer ? incoming : current, incomingNewer ? current : incoming),
    accounts,
    hubPublicUrl: durableHubUrl(incoming.hubPublicUrl) || durableHubUrl(current.hubPublicUrl),
    removedStudents,
    pushSubscriptions: mergePushSubscriptions(current.pushSubscriptions, incoming.pushSubscriptions),
  };
}

export async function studioFromShared(shared: SharedBlob): Promise<StudioCloud> {
  const accounts: Account[] = [];
  for (const account of shared.accounts || []) {
    if (account.role === 'student') {
      accounts.push({
        uid: account.uid,
        name: account.name,
        role: 'student',
        studentId: account.studentId,
        password: account.password,
      });
      continue;
    }
    if (account.role !== 'instructor') continue;
    const passwordHash =
      account.passwordHash || (account.password ? await hashInstructorPassword(account.password) : '');
    if (!account.uid || !account.name || !passwordHash) continue;
    accounts.push({
      uid: account.uid,
      name: account.name,
      role: 'instructor',
      password: '',
      passwordHash,
    });
  }
  return {
    version: shared.version || 0,
    students: shared.students || [],
    closures: shared.closures || [],
    openSlots: dropRemovedOpenSlots(shared.openSlots, shared.removedOpenSlots),
    requests: dropRemovedRequests(shared.requests, shared.removedRequests),
    announcements: shared.announcements || [],
    removedFeedback: mergeRemovedFeedback([], shared.removedFeedback),
    removedRequests: mergeRemovedRequests([], shared.removedRequests),
    removedOpenSlots: mergeRemovedOpenSlots([], shared.removedOpenSlots),
    feedback: dropRemovedFeedback(shared.feedback, shared.removedFeedback),
    ...packBanks(shared.bank, shared.banks),
    accounts,
    hubPublicUrl: durableHubUrl(shared.hubPublicUrl),
    removedStudents: mergeRemovedStudents([], shared.removedStudents),
    pushSubscriptions: mergePushSubscriptions([], shared.pushSubscriptions),
  };
}

export function mergeCloudAccounts(local: Account[], cloud: Account[]): Account[] {
  const localInstructors = local.filter((account) => account.role === 'instructor');
  const cloudInstructors = (cloud || []).filter((account) => account.role === 'instructor');
  let instructors = localInstructors;
  if (!instructors.length && cloudInstructors.length) {
    instructors = cloudInstructors.map((account) => ({
      uid: account.uid,
      name: account.name,
      role: 'instructor' as const,
      password: account.password || '',
      passwordHash: account.passwordHash,
    }));
  } else if (instructors.length && cloudInstructors.length) {
    instructors = instructors.map((account) => {
      const match = cloudInstructors.find(
        (other) =>
          other.uid === account.uid ||
          String(other.name || '').trim().toLowerCase() === String(account.name || '').trim().toLowerCase()
      );
      return match ? { ...account, passwordHash: account.passwordHash || match.passwordHash } : account;
    });
  }
  const fromCloud = (cloud || []).filter((account) => account.role === 'student');
  const fromLocal = local.filter((account) => account.role === 'student');
  return [...instructors, ...(fromCloud.length ? fromCloud : fromLocal)];
}

async function timed(url: string, init?: RequestInit, ms = 8000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

function parseStudio(data: unknown): StudioCloud | null {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const body = data as Partial<StudioCloud> & { students?: unknown; requests?: unknown };
  return {
    ...emptyShared(),
    ...body,
    accounts: Array.isArray(body.accounts) ? body.accounts : [],
    students: Array.isArray(body.students) ? body.students : [],
    closures: Array.isArray(body.closures) ? body.closures : [],
    openSlots: dropRemovedOpenSlots(
      Array.isArray(body.openSlots) ? body.openSlots : [],
      Array.isArray(body.removedOpenSlots) ? body.removedOpenSlots : []
    ),
    requests: dropRemovedRequests(
      Array.isArray(body.requests) ? body.requests : [],
      Array.isArray(body.removedRequests) ? body.removedRequests : []
    ),
    announcements: Array.isArray(body.announcements) ? body.announcements : [],
    removedFeedback: Array.isArray(body.removedFeedback) ? body.removedFeedback.map((id) => String(id || '').trim()).filter(Boolean) : [],
    removedRequests: Array.isArray(body.removedRequests) ? body.removedRequests.map((id) => String(id || '').trim()).filter(Boolean) : [],
    removedOpenSlots: Array.isArray(body.removedOpenSlots)
      ? body.removedOpenSlots.map((id) => String(id || '').trim()).filter(Boolean)
      : [],
    feedback: dropRemovedFeedback(
      Array.isArray(body.feedback) ? body.feedback : [],
      Array.isArray(body.removedFeedback) ? body.removedFeedback : []
    ),
    ...packBanks(body.bank, body.banks),
    hubPublicUrl: durableHubUrl(typeof body.hubPublicUrl === 'string' ? body.hubPublicUrl : ''),
    removedStudents: Array.isArray(body.removedStudents) ? body.removedStudents : [],
    pushSubscriptions: Array.isArray(body.pushSubscriptions) ? body.pushSubscriptions : [],
  };
}

async function fetchExtendsclass(): Promise<StudioCloud | null> {
  if (!CLOUD_URL) return null;
  let merged: StudioCloud | null = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      // Simple GET only. Extra headers trigger Safari's OPTIONS preflight, and the
      // storage API answers OPTIONS with 500 so the student request then fails.
      const res = await timed(`${CLOUD_URL}?t=${Date.now()}-${attempt}`);
      if (!res.ok) continue;
      const studio = parseStudio(await res.json());
      if (!studio) continue;
      merged = merged ? mergeStudio(merged, studio) : mergeStudio(null, studio);
    } catch {
      // retry
    }
  }
  return merged;
}

function rentryText(data: unknown): string {
  if (!data || typeof data !== 'object') return '';
  const body = data as { content?: { text?: string } | string };
  if (typeof body.content === 'string') return body.content;
  if (body.content && typeof body.content === 'object' && typeof body.content.text === 'string') {
    return body.content.text;
  }
  return '';
}

export async function fetchRentry(): Promise<StudioCloud | null> {
  if (!RENTRY_ID) return null;
  try {
    const res = await timed(
      RENTRY_FETCH,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `edit_code=${encodeURIComponent(RENTRY_CODE)}`,
      },
      8000
    );
    if (!res.ok) return null;
    const text = rentryText(await res.json());
    if (!text) return null;
    const studio = parseStudio(JSON.parse(text));
    return studio ? mergeStudio(null, studio) : null;
  } catch {
    return null;
  }
}

export async function fetchCloud(): Promise<StudioCloud | null> {
  const [rentry, ext] = await Promise.all([fetchRentry(), fetchExtendsclass()]);
  if (rentry && ext) {
    return (rentry.version || 0) >= (ext.version || 0) ? mergeStudio(ext, rentry) : mergeStudio(rentry, ext);
  }
  const one = rentry || ext;
  return one ? mergeStudio(null, one) : null;
}

function requestIds(list?: { id: string }[]) {
  return new Set((list || []).map((item) => item.id).filter(Boolean));
}

async function writeRentry(body: StudioCloud): Promise<boolean> {
  if (!RENTRY_ID) return false;
  const payload = JSON.stringify(body);
  try {
    const res = await timed(
      RENTRY_EDIT,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `edit_code=${encodeURIComponent(RENTRY_CODE)}&text=${encodeURIComponent(payload)}`,
      },
      45000
    );
    if (!res.ok) return false;
    const data = (await res.json().catch(() => ({}))) as { status?: string | number };
    return String(data.status || '') === '200';
  } catch {
    return false;
  }
}

async function writeExtendsclass(body: StudioCloud): Promise<boolean> {
  if (!CLOUD_URL) return false;
  const payload = JSON.stringify(body);
  if (payload.length > EXTENDSCLASS_MAX) return false;
  const attempts: RequestInit[] = [
    { method: 'PUT', headers: { 'Content-Type': 'text/plain;charset=UTF-8' }, body: payload },
    { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: payload },
  ];
  for (const init of attempts) {
    try {
      const res = await timed(CLOUD_URL, init, 12000);
      if (res.ok) return true;
    } catch {
      // try the next content type
    }
  }
  return false;
}

export async function putCloud(shared: SharedBlob): Promise<boolean> {
  if (!RENTRY_ID && !CLOUD_URL) return false;
  try {
    const incoming = await studioFromShared(shared);
    incoming.students = stripDataUriAttachments(await externalizeStudents(incoming.students));
    const current = await fetchCloud();
    const merged = current ? mergeStudio(current, incoming) : incoming;
    merged.version = Math.max(merged.version || 0, incoming.version || 0, current?.version || 0);
    const rentryOk = await writeRentry(merged);
    if (rentryOk) void writeExtendsclass(merged);
    if (!rentryOk) return false;
    const neededRequests = requestIds(incoming.requests);
    const neededFeedback = requestIds(incoming.feedback);
    if (!neededRequests.size && !neededFeedback.size) return true;
    const verify = await fetchRentry();
    if (
      [...neededRequests].every((id) => requestIds(verify?.requests).has(id)) &&
      [...neededFeedback].every((id) => requestIds(verify?.feedback).has(id))
    ) {
      return true;
    }
    await writeRentry(mergeStudio(verify, incoming));
    return true;
  } catch {
    return false;
  }
}
