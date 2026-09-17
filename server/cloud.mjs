import { createHash } from 'node:crypto';
import { mergePushSubscriptions } from './pushStore.mjs';
import { mergeBanks, packBanks } from './bank.mjs';
import {
  droppedAttachmentIds,
  externalizeStudents,
  mergeRemovedAttachmentIds,
  mergeSessionAttachments,
  stripDataUriAttachments,
} from '../src/fileCloud.mjs';

const CLOUD_URL = process.env.JYANG_CLOUD_URL || 'https://extendsclass.com/api/json-storage/bin/ebefede';
const RENTRY_ID = process.env.JYANG_RENTRY_ID || 'jyangjyang-studio';
const RENTRY_CODE = process.env.JYANG_RENTRY_CODE || 'jyangcloud';
const RENTRY_FETCH = `https://rentry.co/api/fetch/${RENTRY_ID}`;
const RENTRY_EDIT = `https://rentry.co/api/edit/${RENTRY_ID}`;
const EXTENDSCLASS_MAX = 90_000;
const INSTRUCTOR_PEPPER = 'jyang-instructor';
const REQUEST_RANK = { withdrawn: 0, declined: 0, pending: 1, accepted: 2 };

function isEphemeralHubUrl(url) {
  return /trycloudflare\.com/i.test(String(url || ''));
}

function durableHubUrl(url) {
  const clean = String(url || '').replace(/\/$/, '');
  if (!clean || isEphemeralHubUrl(clean)) return '';
  return clean;
}

export function hashInstructorPassword(password) {
  return createHash('sha256')
    .update(`${INSTRUCTOR_PEPPER}:${String(password || '').trim()}`)
    .digest('hex');
}

export function mergeById(current, incoming, incomingNewer) {
  const map = new Map();
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

export function mergeRequests(current, incoming) {
  const map = new Map();
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

export function sanitizeFeedback(item) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
  const id = String(item.id || '').trim();
  const body = String(item.body || '')
    .replace(/\r\n/g, '\n')
    .trim()
    .slice(0, FEEDBACK_MAX);
  const createdAt = String(item.createdAt || '').trim();
  if (!id || !body) return null;
  return { id, body, createdAt };
}

export function mergeFeedback(current, incoming) {
  const map = new Map();
  for (const item of [...(current || []), ...(incoming || [])]) {
    const clean = sanitizeFeedback(item);
    if (!clean) continue;
    const prev = map.get(clean.id);
    if (!prev || String(clean.createdAt || '') >= String(prev.createdAt || '')) map.set(clean.id, clean);
  }
  return [...map.values()].sort(
    (a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')) || String(b.id).localeCompare(String(a.id))
  );
}

export function mergeRemovedFeedback(current, incoming) {
  const set = new Set();
  for (const id of [...(current || []), ...(incoming || [])]) {
    const clean = String(id || '').trim();
    if (clean) set.add(clean);
  }
  return [...set].sort();
}

export const mergeRemovedRequests = mergeRemovedFeedback;
export const mergeRemovedOpenSlots = mergeRemovedFeedback;

export function dropRemovedFeedback(items, removed) {
  const drop = new Set(mergeRemovedFeedback([], removed));
  return mergeFeedback([], items).filter((item) => !drop.has(item.id));
}

export function dropRemovedRequests(requests, removed) {
  const drop = new Set(mergeRemovedRequests([], removed));
  return (requests || []).filter((item) => item?.id && !drop.has(item.id));
}

export function dropRemovedOpenSlots(slots, removed) {
  const drop = new Set(mergeRemovedOpenSlots([], removed));
  return (slots || []).filter((item) => item?.id && !drop.has(item.id));
}

export function mergeOpenSlots(current, incoming, incomingNewer) {
  const map = new Map();
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

function accountKey(account) {
  if (account.uid) return account.uid;
  if (account.studentId) return `student:${account.studentId}`;
  return `${account.role}:${String(account.name || '').trim().toLowerCase()}`;
}

function publicInstructor(account) {
  return {
    uid: account.uid,
    name: account.name,
    role: 'instructor',
    passwordHash: account.passwordHash || (account.password ? hashInstructorPassword(account.password) : ''),
  };
}

function mergePublicAccounts(current = [], incoming = [], incomingNewer) {
  const instructors = new Map();
  const students = new Map();

  const take = (list, prefer) => {
    for (const account of list || []) {
      if (account.role === 'instructor') {
        const key = accountKey(account);
        const prev = instructors.get(key);
        const next = publicInstructor(account);
        if (!prev) {
          instructors.set(key, next);
          continue;
        }
        instructors.set(key, {
          uid: next.uid || prev.uid,
          name: prefer && next.name ? next.name : prev.name,
          role: 'instructor',
          passwordHash: next.passwordHash || prev.passwordHash,
        });
        continue;
      }
      const key = accountKey(account);
      const prev = students.get(key);
      if (!prev || prefer) {
        students.set(key, {
          uid: account.uid,
          name: account.name,
          role: 'student',
          studentId: account.studentId,
          password: account.password,
        });
      }
    }
  };

  take(current, false);
  take(incoming, incomingNewer);
  return [...instructors.values(), ...students.values()];
}

function sessionStamp(session) {
  return String(session?.updatedAt || '');
}

function mergeText(preferred, fallback) {
  return String(preferred || '') || String(fallback || '');
}

function mergeStudent(prev, incoming, incomingNewer) {
  const preferIncoming = incomingNewer;
  const sessions = new Map();
  for (const session of prev.sessions || []) {
    if (session?.id) sessions.set(session.id, session);
  }
  for (const session of incoming.sessions || []) {
    if (!session?.id) continue;
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
      attachments: mergeSessionAttachments(newer.attachments, other.attachments, removedAttachmentIds),
      makeup: newer.makeup !== undefined ? newer.makeup : other.makeup,
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
    sessions: [...sessions.values()],
  };
}

export function mergeStudents(current, incoming, incomingNewer) {
  const map = new Map();
  for (const student of current || []) {
    if (student?.id) map.set(student.id, student);
  }
  for (const student of incoming || []) {
    if (!student?.id) continue;
    const prev = map.get(student.id);
    map.set(student.id, prev ? mergeStudent(prev, student, incomingNewer) : student);
  }
  return [...map.values()];
}

export function mergeRemovedStudents(current = [], incoming = []) {
  const map = new Map();
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
    map.set(item.id, {
      id: item.id,
      name: prev.name || item.name,
      joinCode: prev.joinCode || item.joinCode,
      linkedUid: prev.linkedUid || item.linkedUid || null,
      removedAt:
        String(prev.removedAt || '') && String(item.removedAt || '') && String(item.removedAt) < String(prev.removedAt)
          ? item.removedAt
          : prev.removedAt || item.removedAt,
    });
  }
  return [...map.values()];
}

export function isStudentRemoved(removed, probe = {}) {
  return (removed || []).some(
    (item) =>
      (probe.id && item.id === probe.id) ||
      (probe.studentId && item.id === probe.studentId) ||
      (probe.uid && item.linkedUid && item.linkedUid === probe.uid) ||
      (probe.linkedUid && item.linkedUid && item.linkedUid === probe.linkedUid)
  );
}

export function normalizeJoinCode(code) {
  return String(code || '').trim().toUpperCase();
}

export function findStudentByJoinCode(students, code) {
  const joinCode = normalizeJoinCode(code);
  if (!joinCode) return null;
  return (students || []).find((student) => normalizeJoinCode(student.joinCode) === joinCode) || null;
}

export function unusedJoinCode(students, removed) {
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

export function resolveStudentJoin(localStudents, cloudStudents, localRemoved, cloudRemoved, code = '', cloudNewer = true) {
  const removed = mergeRemovedStudents(localRemoved, cloudRemoved);
  const roster = liveStudents(mergeStudents(localStudents, cloudStudents || [], cloudNewer), removed);
  const card = findStudentByJoinCode(roster, code);
  return { card, roster, removed };
}

export function liveStudents(students, removed) {
  return (students || []).filter((student) => !isStudentRemoved(removed, student));
}

export function dropStudentsMissingFrom(current, incoming) {
  const liveIds = new Set((incoming || []).map((student) => student.id).filter(Boolean));
  if (!liveIds.size) return current || [];
  return (current || []).filter((student) => liveIds.has(student.id));
}

export function studentSessionRevoked(uid, accounts, students, removed) {
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

export function joinCodeBlocked(code, students, removed) {
  const joinCode = normalizeJoinCode(code);
  if (!joinCode) return false;
  if (findStudentByJoinCode(students, joinCode)) return false;
  return (removed || []).some((item) => normalizeJoinCode(item.joinCode) === joinCode);
}

export function mergeStudio(current, incoming) {
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
  if (incomingNewer && (incoming.students || []).length) students = dropStudentsMissingFrom(students, incoming.students);
  const liveIds = new Set(students.map((student) => student.id));
  let accounts = mergePublicAccounts(current.accounts, incoming.accounts, incomingNewer).filter(
    (account) => account.role !== 'student' || !isStudentRemoved(removedStudents, account)
  );
  if (incomingNewer) {
    accounts = accounts.filter(
      (account) => account.role !== 'student' || !account.studentId || liveIds.has(account.studentId)
    );
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

export function studioFromState(state) {
  return {
    version: state.version || 0,
    students: state.students || [],
    closures: state.closures || [],
    openSlots: dropRemovedOpenSlots(state.openSlots, state.removedOpenSlots),
    requests: dropRemovedRequests(state.requests, state.removedRequests),
    removedFeedback: mergeRemovedFeedback([], state.removedFeedback),
    removedRequests: mergeRemovedRequests([], state.removedRequests),
    removedOpenSlots: mergeRemovedOpenSlots([], state.removedOpenSlots),
    feedback: dropRemovedFeedback(state.feedback, state.removedFeedback),
    ...packBanks(state.bank, state.banks),
    hubPublicUrl: durableHubUrl(state.hubPublicUrl),
    removedStudents: mergeRemovedStudents([], state.removedStudents),
    pushSubscriptions: state.pushSubscriptions || [],
    accounts: (state.accounts || [])
      .map((account) => {
        if (account.role === 'instructor') return publicInstructor(account);
        if (account.role === 'student') {
          return {
            uid: account.uid,
            name: account.name,
            role: account.role,
            studentId: account.studentId,
            password: account.password,
          };
        }
        return null;
      })
      .filter((account) => account && (account.role === 'student' || account.passwordHash)),
  };
}

function parseStudio(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  return {
    version: data.version || 0,
    students: Array.isArray(data.students) ? data.students : [],
    closures: Array.isArray(data.closures) ? data.closures : [],
    openSlots: dropRemovedOpenSlots(
      Array.isArray(data.openSlots) ? data.openSlots : [],
      Array.isArray(data.removedOpenSlots) ? data.removedOpenSlots : []
    ),
    requests: dropRemovedRequests(
        Array.isArray(data.requests) ? data.requests : [],
        Array.isArray(data.removedRequests) ? data.removedRequests : []
      ),
      removedFeedback: Array.isArray(data.removedFeedback)
        ? data.removedFeedback.map((id) => String(id || '').trim()).filter(Boolean)
        : [],
      removedRequests: Array.isArray(data.removedRequests)
        ? data.removedRequests.map((id) => String(id || '').trim()).filter(Boolean)
        : [],
      removedOpenSlots: Array.isArray(data.removedOpenSlots)
        ? data.removedOpenSlots.map((id) => String(id || '').trim()).filter(Boolean)
        : [],
      feedback: dropRemovedFeedback(
        Array.isArray(data.feedback) ? data.feedback : [],
        Array.isArray(data.removedFeedback) ? data.removedFeedback : []
      ),
      ...packBanks(data.bank, data.banks),
      accounts: Array.isArray(data.accounts) ? data.accounts : [],
      hubPublicUrl: durableHubUrl(typeof data.hubPublicUrl === 'string' ? data.hubPublicUrl : ''),
      removedStudents: Array.isArray(data.removedStudents) ? data.removedStudents : [],
      pushSubscriptions: Array.isArray(data.pushSubscriptions) ? data.pushSubscriptions : [],
    };
}

function rentryText(data) {
  if (!data || typeof data !== 'object') return '';
  if (typeof data.content === 'string') return data.content;
  if (data.content && typeof data.content.text === 'string') return data.content.text;
  return '';
}

async function fetchRentry() {
  if (!RENTRY_ID) return null;
  try {
    const res = await fetch(RENTRY_FETCH, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `edit_code=${encodeURIComponent(RENTRY_CODE)}`,
    });
    if (!res.ok) return null;
    const text = rentryText(await res.json());
    if (!text) return null;
    const studio = parseStudio(JSON.parse(text));
    return studio ? mergeStudio(null, studio) : null;
  } catch {
    return null;
  }
}

async function fetchExtendsclass() {
  if (!CLOUD_URL) return null;
  let merged = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const res = await fetch(`${CLOUD_URL}?t=${Date.now()}-${attempt}`);
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

export async function fetchCloud() {
  const [rentry, ext] = await Promise.all([fetchRentry(), fetchExtendsclass()]);
  if (rentry && ext) {
    return (rentry.version || 0) >= (ext.version || 0) ? mergeStudio(ext, rentry) : mergeStudio(rentry, ext);
  }
  return rentry || ext;
}

function requestIds(list) {
  return new Set((list || []).map((item) => item.id).filter(Boolean));
}

async function writeRentry(body) {
  if (!RENTRY_ID) return false;
  try {
    const res = await fetch(RENTRY_EDIT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `edit_code=${encodeURIComponent(RENTRY_CODE)}&text=${encodeURIComponent(JSON.stringify(body))}`,
    });
    if (!res.ok) return false;
    const data = await res.json().catch(() => ({}));
    return String(data.status || '') === '200';
  } catch {
    return false;
  }
}

async function writeExtendsclass(body) {
  if (!CLOUD_URL) return false;
  const payload = JSON.stringify(body);
  if (payload.length > EXTENDSCLASS_MAX) return false;
  try {
    const res = await fetch(CLOUD_URL, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function pushCloud(state) {
  if (!RENTRY_ID && !CLOUD_URL) return false;
  try {
    const incoming = studioFromState(state);
    incoming.students = stripDataUriAttachments(await externalizeStudents(incoming.students));
    const current = await fetchCloud();
    const merged = current ? mergeStudio(current, incoming) : mergeStudio(null, incoming);
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
    return writeRentry(mergeStudio(verify, incoming));
  } catch {
    return false;
  }
}
