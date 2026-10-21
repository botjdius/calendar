import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createUserWithEmailAndPassword,
  deleteUser,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut as fbSignOut,
} from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  query,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  announcementsForStudent,
  applyStudentWrite,
  dropStudentsMissingFrom,
  fetchCloud,
  instructorPasswordMatches,
  isCloudConfigured,
  joinCodeBlocked,
  liveStudents,
  mergeAnnouncements,
  mergeById,
  mergeCloudAccounts,
  mergeFeedback,
  dropRemovedFeedback,
  dropRemovedOpenSlots,
  dropRemovedRequests,
  mergeOpenSlots,
  mergeRemovedFeedback,
  mergeRemovedOpenSlots,
  mergeRemovedRequests,
  mergeRemovedSessionIds,
  mergeRemovedStudents,
  mergeRequests,
  mergeStudents,
  putCloud,
  resolveStudentJoin,
  sanitizeFeedback,
  studentSessionRevoked,
  unusedJoinCode,
} from './cloud';
import { INSTRUCTOR_INVITE_CODE, isFirebaseConfigured } from './config';
import { toggleChecklistChecked } from './lessonChecklist';
import { externalizeStudents, isFilePointer, releaseFilePointer } from './fileCloud.mjs';
import { auth, db } from './firebase';
import { discoverHub, emptyBank, emptyShared, fetchBlob, hubAuth, isEphemeralHubUrl, mergeBanks, packBanks, probeHub, putBlob, rememberHubUrl, rememberPublicHubUrl, savedHubUrl, type SharedBlob } from './hub';
import { feedbackInstructorPush, makeupInstructorPush, makeupStudentPush, notifyClosureStudents, notifyOpenSlotStudents, notifyRemotePush } from './pushNotify';
import { mergePushSubscriptions } from './pushStore';
import { applyRemoveStudent, requestsForLiveStudents } from './studentRoster';
import { sendCloudPush } from './cloudPush';
import { enableWebPush, showWebPushTest, type WebPushResult } from './webPush';
import { pickAndUploadSessionFile } from './files';
import {
  applyAllHolidays,
  applyAttendance,
  applyLessonSetup,
  applyMakeupReplacement,
  formatWeekly,
  appendContinuingSessions,
  generatePack,
  insertSessionAfter,
  isPublicClosure,
  nextOnWeekday,
  nid as makeId,
  normalizeStudent,
  normalizeTime,
  makeupRequestBlockReason,
  paymentBadge,
  postponeOverlaps,
  realignAfter,
  removeSessionById,
  retargetFollowing,
  sequenceSessions,
  todayIso,
  upsertPayment,
} from './schedule';
import {
  applyDecideToRequests,
  applyDecideToSlots,
  applyDecideToStudents,
  applyInstructorAck,
  applyRemoveHistoryMakeup,
  applyReviseToRequests,
  applyReviseToSlots,
  applyReviseToStudents,
  applyStudentChange,
  applyStudentWithdraw,
  claimedSlotIds,
  findReusableMakeup,
  makeupIntent,
  makeupWithdrawBlockReason,
  nowIso,
  reviseMakeupBlockReason,
  type MakeupReviseAction,
} from './makeup';
import type {
  Account,
  Announcement,
  AnonymousFeedback,
  AppUser,
  BankAccount,
  Closure,
  CycleIndex,
  MakeupInfo,
  MakeupRequest,
  MakeupStatus,
  LessonSession,
  OpenSlot,
  SessionFile,
  SessionStatus,
  Student,
} from './types';
export { sessionStats } from './schedule';

const STORAGE_KEY = 'jyang-jyang-v1';
const SESSION_KEY = 'jyang-jyang-session';
const LAST_LOGIN_KEY = 'jyang-jyang-last-login';

type LastLogin = {
  role: 'student' | 'instructor';
  name: string;
  code?: string;
};

type LocalBlob = SharedBlob & { sessionUid: string | null; dirty?: boolean };

type SignInInput = {
  role: 'instructor' | 'student';
  name: string;
  code: string;
  password: string;
};

type SignUpInput = SignInInput;

type SyncMode = 'firebase' | 'hub' | 'cloud' | 'device';

type Store = {
  ready: boolean;
  firebaseOn: boolean;
  cloudOn: boolean;
  syncMode: SyncMode;
  user: AppUser | null;
  students: Student[];
  closures: Closure[];
  openSlots: OpenSlot[];
  requests: MakeupRequest[];
  announcements: Announcement[];
  feedback: AnonymousFeedback[];
  bank: BankAccount;
  banks: BankAccount[];
  error: string | null;
  myStudent: Student | null;
  studentRevoked: boolean;
  hubUrl: string;
  lastLogin: LastLogin | null;
  connectHub: (url: string) => Promise<boolean>;
  clearLastLogin: () => Promise<void>;
  signIn: (input: SignInInput) => Promise<void>;
  signUp: (input: SignUpInput) => Promise<void>;
  signOut: () => Promise<void>;
  deleteMyAccount: () => Promise<void>;
  removeStudent: (id: string) => Promise<void>;
  addStudent: (input: {
    name: string;
    weekday: number;
    time: string;
    startCycle: CycleIndex;
    firstDate?: string;
  }) => Promise<Student>;
  patchStudent: (id: string, patch: Partial<Student>) => Promise<void>;
  setSessionStatus: (studentId: string, sessionId: string, status: SessionStatus) => Promise<void>;
  setMyAbsence: (sessionId: string, absent: boolean) => Promise<void>;
  setSessionDate: (studentId: string, sessionId: string, date: string, time?: string) => Promise<void>;
  setSessionTime: (studentId: string, sessionId: string, time: string) => Promise<void>;
  setFixedTime: (studentId: string, time: string) => Promise<void>;
  applyLessonSetup: (studentId: string, input: {
    weekday: number;
    time: string;
    startCycle: CycleIndex;
    firstDate?: string;
    applyTime?: boolean;
  }) => Promise<void>;
  applyFirstDate: (studentId: string, firstDate: string, time?: string) => Promise<void>;
  applyFixedSchedule: (studentId: string, input: {
    weekday: number;
    time: string;
    startCycle: CycleIndex;
    firstDate?: string;
  }) => Promise<void>;
  addSession: (studentId: string, afterSessionId?: string, cycle?: CycleIndex) => Promise<void>;
  removeSession: (studentId: string, sessionId: string) => Promise<void>;
  setMakeup: (studentId: string, sessionId: string, makeup: MakeupInfo | null) => Promise<void>;
  setMakeupStatus: (studentId: string, sessionId: string, status: MakeupStatus) => Promise<void>;
  setInstructorNote: (studentId: string, sessionId: string, note: string) => Promise<void>;
  setStudentNote: (sessionId: string, note: string) => Promise<void>;
  setChecklistItem: (sessionId: string, itemId: string, checked: boolean) => Promise<void>;
  addSessionFile: (studentId: string, sessionId: string, file?: SessionFile) => Promise<void>;
  removeSessionFile: (studentId: string, sessionId: string, fileId: string) => Promise<void>;
  addClosure: (input: Omit<Closure, 'id'>) => Promise<void>;
  removeClosure: (id: string) => Promise<void>;
  addOpenSlot: (input: Omit<OpenSlot, 'id'>) => Promise<void>;
  removeOpenSlot: (id: string) => Promise<void>;
  requestMakeup: (slotId: string, sessionId: string) => Promise<void>;
  changeMakeup: (requestId: string, slotId: string, sessionId: string) => Promise<void>;
  withdrawMakeup: (requestId: string) => Promise<void>;
  sendAnnouncement: (input: { title: string; body: string; studentIds: string[]; expiresOn: string }) => Promise<number>;
  removeAnnouncement: (id: string) => Promise<void>;
  sendFeedback: (body: string) => Promise<void>;
  removeFeedback: (id: string) => Promise<void>;
  decideMakeup: (requestId: string, accepted: boolean) => Promise<void>;
  reviseMakeup: (requestId: string, action: 'accept' | 'decline' | 'withdraw') => Promise<void>;
  removeMakeupHistory: (requestId: string) => Promise<void>;
  acknowledgeMakeup: (requestIds?: string[]) => Promise<void>;
  saveBank: (bank: BankAccount) => Promise<void>;
  saveBanks: (banks: BankAccount[]) => Promise<void>;
  saveInstructorName: (name: string) => Promise<void>;
  setPackPayment: (studentId: string, pack: number, paid: boolean, paidAt?: string, paidSessionId?: string) => Promise<void>;
  registerWebPush: () => Promise<WebPushResult>;
  sendWebPushTest: () => Promise<void>;
};

const StoreContext = createContext<Store | null>(null);

function nid() {
  return makeId();
}

function makeJoinCode() {
  return unusedJoinCode();
}

function normName(name: string) {
  return name.trim().replace(/\s+/g, '').toLowerCase();
}

function instructorMail(name: string) {
  return `${normName(name) || 'teacher'}@instructor.jyang.local`;
}

function studentMail(code: string) {
  return `${code.trim().toLowerCase()}@student.jyang.local`;
}

function blankStudent(
  id: string,
  name: string,
  weekday = 3,
  time = '14:00',
  startCycle: CycleIndex = 1,
  firstDate?: string
): Student {
  const first = nextOnWeekday(firstDate || todayIso(), weekday);
  const sessions = generatePack({
    startCycle,
    pack: 0,
    weekday,
    time,
    fromDate: first,
    exactFirst: true,
  });
  return {
    id,
    name: name.trim() || '레슨생',
    joinCode: makeJoinCode(),
    linkedUid: null,
    paid: false,
    payments: [],
    weekday,
    time,
    weeklyTime: formatWeekly(weekday, time),
    startCycle,
    sessions,
  };
}

const emptyBlob = (): LocalBlob => ({
  ...emptyShared(),
  sessionUid: null,
  dirty: false,
});

async function loadDevice(): Promise<LocalBlob> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (!raw) return emptyBlob();
  return { ...emptyBlob(), ...JSON.parse(raw) };
}

async function saveDevice(blob: LocalBlob) {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(blob));
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<AppUser | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [closures, setClosures] = useState<Closure[]>([]);
  const [openSlots, setOpenSlotsState] = useState<OpenSlot[]>([]);
  const [requests, setRequestsState] = useState<MakeupRequest[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [feedback, setFeedbackState] = useState<AnonymousFeedback[]>([]);
  const [bank, setBank] = useState<BankAccount>(emptyBank());
  const [banks, setBanks] = useState<BankAccount[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [syncMode, setSyncMode] = useState<SyncMode>('device');
  const [hubUrl, setHubUrl] = useState('');
  const [lastLogin, setLastLogin] = useState<LastLogin | null>(null);
  const hubBase = useRef<string | null>(null);
  const sessionUidRef = useRef<string | null>(null);
  const hubPollRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const writeLockRef = useRef(0);
  const dirtyRef = useRef(false);
  const writeGenRef = useRef(0);
  const dataVersionRef = useRef(0);
  const pollBusyRef = useRef(false);
  const requestsRef = useRef<MakeupRequest[]>([]);
  const feedbackRef = useRef<AnonymousFeedback[]>([]);
  const removedFeedbackRef = useRef<string[]>([]);
  const removedRequestsRef = useRef<string[]>([]);
  const removedOpenSlotsRef = useRef<string[]>([]);
  const firebaseOn = isFirebaseConfigured && !!auth && !!db;

  function setRequests(next: MakeupRequest[]) {
    const merged = dropRemovedRequests(next, removedRequestsRef.current);
    requestsRef.current = merged;
    setRequestsState(merged);
  }

  function setFeedback(next: AnonymousFeedback[]) {
    const merged = dropRemovedFeedback(next, removedFeedbackRef.current);
    feedbackRef.current = merged;
    setFeedbackState(merged);
  }

  function rememberRemovedFeedback(ids?: string[]) {
    removedFeedbackRef.current = mergeRemovedFeedback(removedFeedbackRef.current, ids);
  }

  function rememberRemovedRequests(ids?: string[]) {
    removedRequestsRef.current = mergeRemovedRequests(removedRequestsRef.current, ids);
  }

  function rememberRemovedOpenSlots(ids?: string[]) {
    removedOpenSlotsRef.current = mergeRemovedOpenSlots(removedOpenSlotsRef.current, ids);
  }

  function setOpenSlots(next: OpenSlot[]) {
    setOpenSlotsState(dropRemovedOpenSlots(next, removedOpenSlotsRef.current));
  }

  function showFeedback(list: AnonymousFeedback[] | undefined, uid: string | null, accounts?: Account[], removed?: string[]) {
    rememberRemovedFeedback(removed);
    const merged = dropRemovedFeedback(mergeFeedback(feedbackRef.current, list), removedFeedbackRef.current);
    feedbackRef.current = merged;
    const acc = (accounts || []).find((a) => a.uid === uid);
    setFeedbackState(acc?.role === 'instructor' ? merged : []);
  }

  function applyPacked(bank?: BankAccount | null, list?: BankAccount[] | null) {
    const packed = packBanks(bank, list);
    setBank(packed.bank);
    setBanks(packed.banks);
    return packed;
  }

  function applyShared(shared: SharedBlob, uid: string | null, opts?: { replace?: boolean }) {
    const removed = shared.removedStudents || [];
    const live = liveStudents(shared.students, removed);
    const acc = (shared.accounts || []).find((a) => a.uid === uid) ?? null;
    const revoked = studentSessionRevoked(uid, shared.accounts, live, removed);
    if (revoked) {
      setRequests([]);
      setAnnouncements([]);
      setStudents([]);
      setClosures([]);
      setOpenSlots([]);
      showFeedback(shared.feedback, uid, shared.accounts, shared.removedFeedback);
      if (acc) setUser(toUser(acc));
      return;
    }
    const incomplete = Boolean(uid) && !acc && !opts?.replace;
    const nextRequests = opts?.replace
      ? shared.requests || []
      : mergeRequests(requestsRef.current, shared.requests);
    rememberRemovedRequests(shared.removedRequests);
    rememberRemovedOpenSlots(shared.removedOpenSlots);
    setRequests(requestsForLiveStudents(nextRequests, live));
    setAnnouncements((current) =>
      opts?.replace
        ? shared.announcements || []
        : mergeAnnouncements(current, shared.announcements || [], true)
    );
    showFeedback(shared.feedback, uid, shared.accounts, shared.removedFeedback);
    if (!incomplete) {
      const closuresNext = (shared.closures || []).map((c) => ({ ...c, scope: c.scope || 'all' }));
      setStudents(live.map((s) => normalizeStudent(s)));
      setClosures(closuresNext);
      setOpenSlots(dropRemovedOpenSlots(shared.openSlots || [], shared.removedOpenSlots));
      applyPacked(shared.bank, shared.banks);
    }
    if (acc) setUser(toUser(acc));
    else if (!uid || opts?.replace) setUser(null);
  }

  async function cacheHubView(shared: SharedBlob, uid: string | null) {
    const latest = await loadDevice();
    const removed = mergeRemovedStudents(latest.removedStudents, shared.removedStudents);
    const live = liveStudents(shared.students, removed);
    const revoked = studentSessionRevoked(uid, shared.accounts, live, removed);
    const hasAccount = (shared.accounts || []).some((a) => a.uid === uid);
    const incomplete = Boolean(uid) && !hasAccount && !revoked;
    if (revoked) {
      await saveDevice({
        ...latest,
        removedStudents: removed,
        sessionUid: uid ?? latest.sessionUid,
        dirty: false,
      });
      return;
    }
    const removedFeedback = mergeRemovedFeedback(latest.removedFeedback, shared.removedFeedback);
    const removedRequests = mergeRemovedRequests(latest.removedRequests, shared.removedRequests);
    const removedOpenSlots = mergeRemovedOpenSlots(latest.removedOpenSlots, shared.removedOpenSlots);
    rememberRemovedOpenSlots(removedOpenSlots);
    const requests = dropRemovedRequests(
      requestsForLiveStudents(
        mergeRequests(mergeRequests(latest.requests, requestsRef.current), shared.requests),
        live
      ),
      removedRequests
    );
    rememberRemovedRequests(removedRequests);
    const feedback = dropRemovedFeedback(
      mergeFeedback(mergeFeedback(latest.feedback, feedbackRef.current), shared.feedback),
      removedFeedback
    );
    await saveDevice({
      ...emptyBlob(),
      ...latest,
      version: incomplete ? latest.version : shared.version || latest.version,
      accounts: incomplete ? latest.accounts : shared.accounts || latest.accounts,
      students: incomplete ? latest.students : live.map((s) => normalizeStudent(s)),
      closures: incomplete ? latest.closures : shared.closures || latest.closures,
      openSlots: dropRemovedOpenSlots(
        incomplete ? latest.openSlots : Array.isArray(shared.openSlots) ? shared.openSlots : latest.openSlots,
        removedOpenSlots
      ),
      requests,
      announcements: mergeAnnouncements(latest.announcements, shared.announcements || [], true),
      feedback,
      removedFeedback,
      removedRequests,
      removedOpenSlots,
      ...(incomplete ? packBanks(latest.bank, latest.banks) : mergeBanks(shared, latest)),
      removedStudents: removed,
      pushSubscriptions: mergePushSubscriptions(latest.pushSubscriptions, shared.pushSubscriptions),
      sessionUid: uid ?? latest.sessionUid,
      dirty: incomplete ? latest.dirty || dirtyRef.current : false,
    });
    setRequests(requests);
    setAnnouncements((current) => mergeAnnouncements(current, shared.announcements || [], true));
    showFeedback(feedback, uid, incomplete ? latest.accounts : shared.accounts || latest.accounts, removedFeedback);
    if (!incomplete) {
      dirtyRef.current = false;
      dataVersionRef.current = shared.version || latest.version || 0;
    }
  }

  async function flushDirty(base: string) {
    const uid = sessionUidRef.current;
    if (!uid || writeLockRef.current) return;
    const local = await loadDevice();
    if (!local.dirty && !dirtyRef.current) return;
    const gen = writeGenRef.current;
    writeLockRef.current += 1;
    try {
      const saved = await putBlob(base, uid, {
        accounts: local.accounts,
        students: local.students,
        closures: local.closures,
        openSlots: local.openSlots,
        requests: local.requests,
        announcements: local.announcements || [],
        feedback: local.feedback || [],
        ...packBanks(local.bank, local.banks),
        removedStudents: local.removedStudents || [],
        removedFeedback: local.removedFeedback || [],
        removedRequests: local.removedRequests || [],
        removedOpenSlots: local.removedOpenSlots || [],
        pushSubscriptions: local.pushSubscriptions || [],
      });
      if (writeGenRef.current !== gen) return;
      applyShared(saved, uid);
      await cacheHubView(saved, uid);
    } catch {
      hubBase.current = null;
      setSyncMode('device');
    } finally {
      writeLockRef.current -= 1;
    }
  }

  function syncDirtyToHub() {
    const base = hubBase.current;
    if (base) void flushDirty(base);
    void pushCloudSnapshot();
  }

  async function pushCloudSnapshot() {
    const local = await loadDevice();
    if (!isCloudConfigured) return false;
    return putCloud({
      version: local.version || dataVersionRef.current || 0,
      accounts: local.accounts,
      students: local.students,
      closures: local.closures,
      openSlots: local.openSlots,
      requests: local.requests,
      announcements: local.announcements || [],
      feedback: local.feedback || [],
      ...packBanks(local.bank, local.banks),
      removedStudents: local.removedStudents || [],
      removedFeedback: local.removedFeedback || [],
      removedRequests: local.removedRequests || [],
      removedOpenSlots: local.removedOpenSlots || [],
      pushSubscriptions: local.pushSubscriptions || [],
    });
  }

  async function mergeRequestsFromNetwork(hubRequests?: MakeupRequest[]) {
    const local = await loadDevice();
    const cloud = isCloudConfigured ? await fetchCloud() : null;
    const merged = dropRemovedRequests(
      mergeRequests(mergeRequests(local.requests, hubRequests), cloud?.requests),
      mergeRemovedRequests(local.removedRequests, cloud?.removedRequests)
    );
    if (JSON.stringify(merged) === JSON.stringify(local.requests || [])) return false;
    const next: LocalBlob = {
      ...local,
      requests: merged,
      version: Math.max(local.version || 0, cloud?.version || 0, dataVersionRef.current || 0),
    };
    await saveDevice(next);
    setRequests(merged);
    dataVersionRef.current = next.version || dataVersionRef.current;
    return true;
  }

  async function ensureHub() {
    if (hubBase.current) return hubBase.current;
    let found = await discoverHub();
    if (!found && isCloudConfigured) {
      const cloud = await fetchCloud();
      const pub = String(cloud?.hubPublicUrl || '').replace(/\/$/, '');
      if (pub && !isEphemeralHubUrl(pub)) {
        await rememberPublicHubUrl(pub);
        found = await probeHub(pub);
      }
    }
    if (found) {
      try {
        await attachHub(found);
      } catch {
        hubBase.current = found;
        setHubUrl(found);
        await rememberHubUrl(found);
      }
    }
    return hubBase.current;
  }

  async function applyCloudIfNewer(uid: string | null, force = false) {
    const gen = writeGenRef.current;
    const cloud = await fetchCloud();
    if (!cloud) return false;
    if (cloud.hubPublicUrl && !isEphemeralHubUrl(cloud.hubPublicUrl)) {
      await rememberPublicHubUrl(cloud.hubPublicUrl);
    }
    const local = await loadDevice();
    const mergedRequests = mergeRequests(mergeRequests(local.requests, requestsRef.current), cloud.requests);
    const mergedAnnouncements = mergeAnnouncements(local.announcements, cloud.announcements || [], true);
    const mergedFeedback = mergeFeedback(mergeFeedback(local.feedback, feedbackRef.current), cloud.feedback);
    const requestsChanged = JSON.stringify(mergedRequests) !== JSON.stringify(local.requests || []);
    const announcementsChanged = JSON.stringify(mergedAnnouncements) !== JSON.stringify(local.announcements || []);
    const feedbackChanged = JSON.stringify(mergedFeedback) !== JSON.stringify(local.feedback || []);
    const incomingNewer = (cloud.version || 0) > (local.version || dataVersionRef.current || 0);
    const latest = await loadDevice();
    if (!force && (writeGenRef.current !== gen || latest.dirty || dirtyRef.current)) {
      const keptRemovedFeedback = mergeRemovedFeedback(latest.removedFeedback, cloud.removedFeedback);
      const keptRemovedRequests = mergeRemovedRequests(latest.removedRequests, cloud.removedRequests);
      const keptRemovedOpenSlots = mergeRemovedOpenSlots(latest.removedOpenSlots, cloud.removedOpenSlots);
      const kept = dropRemovedRequests(
        mergeRequests(mergeRequests(latest.requests, requestsRef.current), cloud.requests),
        keptRemovedRequests
      );
      const keptAnnouncements = mergeAnnouncements(latest.announcements, cloud.announcements || [], true);
      const keptFeedback = dropRemovedFeedback(
        mergeFeedback(mergeFeedback(latest.feedback, feedbackRef.current), cloud.feedback),
        keptRemovedFeedback
      );
      const keptRemovedStudents = mergeRemovedStudents(latest.removedStudents, cloud.removedStudents);
      const keptStudents = liveStudents(
        mergeStudents(latest.students, cloud.students || [], incomingNewer || force),
        keptRemovedStudents
      );
      let keptOpenSlots = dropRemovedOpenSlots(
        mergeOpenSlots(latest.openSlots, cloud.openSlots || [], incomingNewer || force),
        keptRemovedOpenSlots
      );
      if ((incomingNewer || force) && (cloud.openSlots || []).length) {
        const cloudIds = new Set((cloud.openSlots || []).map((item) => item.id));
        keptOpenSlots = keptOpenSlots.filter((item) => cloudIds.has(item.id));
      }
      const studentsChanged = JSON.stringify(keptStudents) !== JSON.stringify(latest.students || []);
      const keptRequestsChanged = JSON.stringify(kept) !== JSON.stringify(latest.requests || []);
      const keptAnnouncementsChanged =
        JSON.stringify(keptAnnouncements) !== JSON.stringify(latest.announcements || []);
      const keptFeedbackChanged = JSON.stringify(keptFeedback) !== JSON.stringify(latest.feedback || []);
      const keptOpenSlotsChanged = JSON.stringify(keptOpenSlots) !== JSON.stringify(latest.openSlots || []);
      if (studentsChanged || keptRequestsChanged || keptAnnouncementsChanged || keptFeedbackChanged || keptOpenSlotsChanged) {
        rememberRemovedOpenSlots(keptRemovedOpenSlots);
        await saveDevice({
          ...latest,
          students: keptStudents,
          requests: kept,
          announcements: keptAnnouncements,
          feedback: keptFeedback,
          openSlots: keptOpenSlots,
          removedFeedback: keptRemovedFeedback,
          removedRequests: keptRemovedRequests,
          removedOpenSlots: keptRemovedOpenSlots,
          removedStudents: keptRemovedStudents,
        });
        setStudents(keptStudents.map((s) => normalizeStudent(s)));
        setRequests(kept);
        setAnnouncements(keptAnnouncements);
        setOpenSlots(keptOpenSlots);
        showFeedback(keptFeedback, uid, latest.accounts, keptRemovedFeedback);
      }
      return false;
    }
    const removedStudents = mergeRemovedStudents(latest.removedStudents, cloud.removedStudents);
    const removedFeedback = mergeRemovedFeedback(latest.removedFeedback, cloud.removedFeedback);
    const removedOpenSlots = mergeRemovedOpenSlots(latest.removedOpenSlots, cloud.removedOpenSlots);
    let students = liveStudents(
      mergeStudents(latest.students, cloud.students || [], incomingNewer || force),
      removedStudents
    );
    if (incomingNewer || force) {
      if ((cloud.students || []).length) students = dropStudentsMissingFrom(students, cloud.students);
    }
    const studentsChanged = JSON.stringify(students) !== JSON.stringify(latest.students || []);
    let openSlotsNext = dropRemovedOpenSlots(
      mergeOpenSlots(latest.openSlots, cloud.openSlots || [], incomingNewer || force),
      removedOpenSlots
    );
    if ((incomingNewer || force) && (cloud.openSlots || []).length) {
      const cloudIds = new Set((cloud.openSlots || []).map((item) => item.id));
      openSlotsNext = openSlotsNext.filter((item) => cloudIds.has(item.id));
    }
    const openSlotsChanged = JSON.stringify(openSlotsNext) !== JSON.stringify(latest.openSlots || []);
    if (!force && !incomingNewer && !requestsChanged && !announcementsChanged && !feedbackChanged && !studentsChanged && !openSlotsChanged) {
      return false;
    }
    const next: LocalBlob = {
      ...latest,
      version: Math.max(cloud.version || 0, latest.version || 0, dataVersionRef.current || 0),
      students,
      closures: mergeById(latest.closures, cloud.closures || [], incomingNewer || force),
      openSlots: openSlotsNext,
      requests: dropRemovedRequests(
        mergeRequests(mergeRequests(latest.requests, requestsRef.current), cloud.requests),
        mergeRemovedRequests(latest.removedRequests, cloud.removedRequests)
      ),
      announcements: mergeAnnouncements(latest.announcements, cloud.announcements || [], incomingNewer || force),
      feedback: dropRemovedFeedback(
        mergeFeedback(mergeFeedback(latest.feedback, feedbackRef.current), cloud.feedback),
        removedFeedback
      ),
      removedFeedback,
      removedRequests: mergeRemovedRequests(latest.removedRequests, cloud.removedRequests),
      removedOpenSlots,
      ...(incomingNewer || force ? mergeBanks(cloud, latest) : mergeBanks(latest, cloud)),
      accounts: mergeCloudAccounts(latest.accounts, cloud.accounts),
      removedStudents,
      sessionUid: uid ?? latest.sessionUid,
      dirty: false,
    };
    await saveDevice(next);
    applyShared(next, next.sessionUid);
    dirtyRef.current = false;
    dataVersionRef.current = next.version || 0;
    if (!hubBase.current) setSyncMode('cloud');
    const role = next.accounts.find((a) => a.uid === uid)?.role;
    if (hubBase.current && uid && (requestsChanged || announcementsChanged || feedbackChanged) && role === 'instructor') {
      try {
        const saved = await putBlob(hubBase.current, uid, {
          accounts: next.accounts,
          students: next.students,
          closures: next.closures,
          openSlots: next.openSlots,
          requests: next.requests,
          announcements: next.announcements || [],
          feedback: next.feedback || [],
          ...packBanks(next.bank, next.banks),
          removedStudents: next.removedStudents || [],
          removedFeedback: next.removedFeedback || [],
          removedRequests: next.removedRequests || [],
          removedOpenSlots: next.removedOpenSlots || [],
        });
        applyShared(saved, uid);
        await cacheHubView(saved, uid);
      } catch {
        // hub picks up on the next pull
      }
    }
    return true;
  }

  function startHubPoll(base: string) {
    if (hubPollRef.current) clearInterval(hubPollRef.current);
    hubPollRef.current = setInterval(async () => {
      if (pollBusyRef.current || writeLockRef.current) return;
      pollBusyRef.current = true;
      try {
        if (dirtyRef.current) {
          await flushDirty(base);
        }
        const next = await fetchBlob(base, sessionUidRef.current);
        if (writeLockRef.current) return;
        const local = await loadDevice();
        const cloud = isCloudConfigured ? await fetchCloud() : null;
        const removed = mergeRemovedStudents(
          local.removedStudents,
          mergeRemovedStudents(next.removedStudents, cloud?.removedStudents)
        );
        const live = liveStudents(next.students?.length ? next.students : local.students, removed);
        if (studentSessionRevoked(sessionUidRef.current, next.accounts?.length ? next.accounts : local.accounts, live, removed)) {
          applyShared({ ...local, removedStudents: removed }, sessionUidRef.current);
          await cacheHubView({ ...next, removedStudents: removed }, sessionUidRef.current);
          return;
        }
        const incomingRequests = mergeRequests(
          mergeRequests(mergeRequests(local.requests, requestsRef.current), next.requests),
          cloud?.requests
        );
        const incomingAnnouncements = mergeAnnouncements(
          mergeAnnouncements(local.announcements, next.announcements || [], true),
          cloud?.announcements || [],
          true
        );
        const incomingFeedback = mergeFeedback(
          mergeFeedback(mergeFeedback(local.feedback, feedbackRef.current), next.feedback),
          cloud?.feedback
        );
        const requestsChanged = JSON.stringify(incomingRequests) !== JSON.stringify(local.requests || []);
        const announcementsChanged =
          JSON.stringify(incomingAnnouncements) !== JSON.stringify(local.announcements || []);
        const feedbackChanged = JSON.stringify(incomingFeedback) !== JSON.stringify(local.feedback || []);
        const removedOpenSlots = mergeRemovedOpenSlots(
          local.removedOpenSlots,
          mergeRemovedOpenSlots(next.removedOpenSlots, cloud?.removedOpenSlots)
        );
        const incomingSlots = dropRemovedOpenSlots(
          mergeOpenSlots(
            mergeOpenSlots(local.openSlots, next.openSlots, (next.version || 0) >= (local.version || 0)),
            cloud?.openSlots,
            (cloud?.version || 0) >= Math.max(next.version || 0, local.version || 0)
          ),
          removedOpenSlots
        );
        const openSlotsChanged = JSON.stringify(incomingSlots) !== JSON.stringify(local.openSlots || []);
        const incomplete = Boolean(sessionUidRef.current) && !(next.accounts || []).some((a) => a.uid === sessionUidRef.current);
        const versionChanged = !incomplete && (next.version || 0) !== dataVersionRef.current;
        if (!versionChanged && !requestsChanged && !announcementsChanged && !feedbackChanged && !openSlotsChanged) return;
        if (dirtyRef.current || incomplete) {
          if (requestsChanged || announcementsChanged || feedbackChanged || openSlotsChanged) {
            rememberRemovedOpenSlots(removedOpenSlots);
            await saveDevice({
              ...local,
              requests: incomingRequests,
              announcements: incomingAnnouncements,
              feedback: incomingFeedback,
              openSlots: incomingSlots,
              removedOpenSlots,
            });
            setRequests(incomingRequests);
            setAnnouncements(incomingAnnouncements);
            setOpenSlots(incomingSlots);
            showFeedback(incomingFeedback, sessionUidRef.current, local.accounts);
          }
          return;
        }
        if (versionChanged) {
          setStudents((next.students || []).map((s) => normalizeStudent(s)));
          setClosures(next.closures);
          applyPacked(next.bank, next.banks);
        }
        if (versionChanged || openSlotsChanged) {
          rememberRemovedOpenSlots(removedOpenSlots);
          setOpenSlots(incomingSlots);
        }
        setRequests(incomingRequests);
        setAnnouncements(incomingAnnouncements);
        showFeedback(incomingFeedback, sessionUidRef.current, next.accounts?.length ? next.accounts : local.accounts);
        await cacheHubView(
          versionChanged
            ? { ...next, requests: incomingRequests, announcements: incomingAnnouncements, feedback: incomingFeedback, openSlots: incomingSlots, removedOpenSlots }
            : {
                ...local,
                requests: incomingRequests,
                announcements: incomingAnnouncements,
                feedback: incomingFeedback,
                openSlots: incomingSlots,
                removedOpenSlots,
                version: local.version,
              },
          sessionUidRef.current
        );
      } catch {
        // keep last snapshot
      } finally {
        pollBusyRef.current = false;
      }
    }, 4000);
    return hubPollRef.current;
  }

  async function attachHub(base: string) {
    const uid = sessionUidRef.current;
    const local = await loadDevice();
    hubBase.current = base;
    setHubUrl(base);
    setSyncMode('hub');
    if (uid && local.dirty) {
      const saved = await putBlob(base, uid, {
        accounts: local.accounts,
        students: local.students,
        closures: local.closures,
        openSlots: local.openSlots,
        requests: local.requests,
        announcements: local.announcements || [],
        feedback: local.feedback || [],
        ...packBanks(local.bank, local.banks),
        removedStudents: local.removedStudents || [],
        removedFeedback: local.removedFeedback || [],
        removedRequests: local.removedRequests || [],
        removedOpenSlots: local.removedOpenSlots || [],
        pushSubscriptions: local.pushSubscriptions || [],
      });
      applyShared(saved, uid);
      await cacheHubView(saved, uid);
    } else {
      const next = await fetchBlob(base, uid);
      applyShared(next, uid);
      await cacheHubView(next, uid);
    }
    startHubPoll(base);
    void applyCloudIfNewer(uid, false);
  }

  function startReconnectPoll() {
    return setInterval(async () => {
      if (hubBase.current) return;
      const base = await discoverHub();
      if (!base) return;
      try {
        await attachHub(base);
      } catch {
        hubBase.current = null;
        setSyncMode('device');
      }
    }, 4000);
  }

  useEffect(() => {
    let unsub = () => {};
    let poll: ReturnType<typeof setInterval> | undefined;
    let cloudPoll: ReturnType<typeof setInterval> | undefined;
    (async () => {
      if (firebaseOn) {
        setSyncMode('firebase');
        unsub = onAuthStateChanged(auth!, async (fbUser) => {
          if (!fbUser) {
            setUser(null);
            setStudents([]);
            setClosures([]);
            setOpenSlots([]);
            setRequests([]);
            setFeedback([]);
            removedFeedbackRef.current = [];
            removedRequestsRef.current = [];
            removedOpenSlotsRef.current = [];
            setBank(emptyBank());
            setBanks([]);
            setReady(true);
            return;
          }
          const snap = await getDoc(doc(db!, 'users', fbUser.uid));
          const profile = snap.data() as Omit<AppUser, 'uid'> | undefined;
          setUser({
            uid: fbUser.uid,
            name: profile?.name ?? '사용자',
            role: profile?.role ?? 'student',
            studentId: profile?.studentId,
          });
          setReady(true);
        });
        return;
      }

      const remembered = await savedHubUrl();
      if (remembered) setHubUrl(remembered);
      let savedLogin: LastLogin | null = null;
      try {
        const raw = await AsyncStorage.getItem(LAST_LOGIN_KEY);
        savedLogin = raw ? (JSON.parse(raw) as LastLogin) : null;
        if (savedLogin?.name) setLastLogin(savedLogin);
      } catch {
        savedLogin = null;
      }

      const blob = await loadDevice();
      const sessionUid = blob.sessionUid || (await AsyncStorage.getItem(SESSION_KEY));
      sessionUidRef.current = sessionUid;
      applyShared(blob, sessionUid);
      if (!blob.accounts.some((a) => a.uid === sessionUid) && savedLogin?.name) {
        const acc = blob.accounts.find(
          (a) => a.role === savedLogin!.role && normName(a.name) === normName(savedLogin!.name)
        );
        if (acc) {
          sessionUidRef.current = acc.uid;
          await rememberUid(acc.uid);
          applyShared(blob, acc.uid);
        }
      }
      setSyncMode('device');
      setReady(true);
      poll = startReconnectPoll();
      if (isCloudConfigured) {
        try {
          await applyCloudIfNewer(sessionUidRef.current, !blob.students.length);
        } catch {
          // keep device snapshot
        }
        cloudPoll = setInterval(() => {
          if (writeLockRef.current) return;
          void (async () => {
            if (dirtyRef.current) {
              const ok = await pushCloudSnapshot();
              if (ok) {
                dirtyRef.current = false;
                const local = await loadDevice();
                await saveDevice({ ...local, dirty: false });
                if (!hubBase.current) setSyncMode('cloud');
              }
              return;
            }
            void applyCloudIfNewer(sessionUidRef.current);
          })();
        }, 4000);
      }

      try {
        const base = await discoverHub();
        if (base) await attachHub(base);
      } catch {
        hubBase.current = null;
        if (!isCloudConfigured) setSyncMode('device');
      }
    })();
    return () => {
      unsub();
      if (poll) clearInterval(poll);
      if (cloudPoll) clearInterval(cloudPoll);
      if (hubPollRef.current) clearInterval(hubPollRef.current);
    };
  }, [firebaseOn]);

  useEffect(() => {
    if (!firebaseOn || !user || !db) return;

    const unsubs: Array<() => void> = [];
    if (user.role === 'instructor') {
      unsubs.push(onSnapshot(collection(db, 'students'), (s) => {
        setStudents(s.docs.map((d) => d.data() as Student));
      }));
      unsubs.push(onSnapshot(collection(db, 'closures'), (s) => {
        setClosures(s.docs.map((d) => d.data() as Closure));
      }));
    } else {
      unsubs.push(
        onSnapshot(
          query(collection(db, 'students'), where('linkedUid', '==', user.uid)),
          (s) => {
            const fromLink = s.docs.map((d) => d.data() as Student);
            if (fromLink.length) setStudents(fromLink);
          }
        )
      );
      if (user.studentId) {
        unsubs.push(
          onSnapshot(doc(db, 'students', user.studentId), (snap) => {
            if (!snap.exists()) return;
            const mine = snap.data() as Student;
            setStudents((prev) => {
              if (prev.some((p) => p.id === mine.id)) return prev.map((p) => (p.id === mine.id ? mine : p));
              return [mine, ...prev];
            });
          })
        );
      }
      unsubs.push(
        onSnapshot(
          query(collection(db, 'closures'), where('scope', '==', 'all')),
          (s) => {
            setClosures((prev) => {
              const mine = prev.filter((c) => c.scope === 'student');
              const pub = s.docs.map((d) => d.data() as Closure);
              return [...pub, ...mine.filter((m) => !pub.some((p) => p.id === m.id))];
            });
          }
        )
      );
      if (user.studentId) {
        unsubs.push(
          onSnapshot(
            query(collection(db, 'closures'), where('studentId', '==', user.studentId)),
            (s) => {
              setClosures((prev) => {
                const pub = prev.filter((c) => c.scope === 'all');
                const mine = s.docs.map((d) => d.data() as Closure);
                return [...pub, ...mine];
              });
            }
          )
        );
      }
    }
    unsubs.push(onSnapshot(collection(db, 'openSlots'), (s) => {
      setOpenSlots(s.docs.map((d) => d.data() as OpenSlot));
    }));
    unsubs.push(onSnapshot(collection(db, 'makeupRequests'), (s) => {
      const all = s.docs.map((d) => d.data() as MakeupRequest);
      setRequests(user.role === 'instructor' ? all : all.filter((r) => r.studentId === user.studentId));
    }));
    unsubs.push(onSnapshot(collection(db, 'announcements'), (s) => {
      const all = s.docs.map((d) => d.data() as Announcement);
      setAnnouncements(
        user.role === 'instructor'
          ? all
          : all.filter((item) => Boolean(user.studentId && item.studentIds.includes(user.studentId)))
      );
    }));
    unsubs.push(onSnapshot(doc(db, 'studio', 'bank'), (snap) => {
      const data = snap.exists() ? (snap.data() as BankAccount & { banks?: BankAccount[] }) : emptyBank();
      applyPacked(data, (data as { banks?: BankAccount[] }).banks);
    }));
    if (user.role === 'instructor') {
      unsubs.push(onSnapshot(collection(db, 'feedback'), (s) => {
        setFeedback(s.docs.map((d) => d.data() as AnonymousFeedback));
      }));
    }
    return () => unsubs.forEach((u) => u());
  }, [firebaseOn, user]);

  async function persistShared(
    patch: Partial<SharedBlob> & { sessionUid?: string | null },
    opts?: { skipCloud?: boolean; replace?: boolean }
  ) {
    writeLockRef.current += 1;
    dirtyRef.current = true;
    writeGenRef.current += 1;
    try {
      const blob = await loadDevice();
      const uid = patch.sessionUid ?? sessionUidRef.current ?? (await AsyncStorage.getItem(SESSION_KEY));
      const cloud = !opts?.skipCloud && isCloudConfigured ? await fetchCloud() : null;
      const removedStudents = mergeRemovedStudents(
        blob.removedStudents,
        mergeRemovedStudents(cloud?.removedStudents, patch.removedStudents)
      );
      const removedFeedback = mergeRemovedFeedback(
        blob.removedFeedback,
        mergeRemovedFeedback(cloud?.removedFeedback, patch.removedFeedback)
      );
      const removedRequests = mergeRemovedRequests(
        blob.removedRequests,
        mergeRemovedRequests(cloud?.removedRequests, patch.removedRequests)
      );
      const removedOpenSlots = mergeRemovedOpenSlots(
        blob.removedOpenSlots,
        mergeRemovedOpenSlots(cloud?.removedOpenSlots, patch.removedOpenSlots)
      );
      const incomingNewer = (cloud?.version || 0) >= (blob.version || dataVersionRef.current || 0);
      let mergedStudents = cloud ? mergeStudents(blob.students, cloud.students, incomingNewer) : blob.students;
      mergedStudents = liveStudents(mergedStudents, removedStudents);
      if (cloud && incomingNewer && (cloud.students || []).length) {
        const cloudIds = new Set((cloud.students || []).map((item) => item.id));
        const addedIds = new Set(
          (patch.students || [])
            .filter((item) => !(blob.students || []).some((prev) => prev.id === item.id))
            .map((item) => item.id)
        );
        mergedStudents = mergedStudents.filter((item) => cloudIds.has(item.id) || addedIds.has(item.id));
      }
      let mergedSlots = dropRemovedOpenSlots(
        cloud ? mergeOpenSlots(blob.openSlots, cloud.openSlots, incomingNewer) : blob.openSlots,
        removedOpenSlots
      );
      if (cloud && incomingNewer && (cloud.openSlots || []).length) {
        const cloudSlotIds = new Set((cloud.openSlots || []).map((item) => item.id));
        const addedSlotIds = new Set((patch.openSlots || []).map((item) => item.id));
        mergedSlots = mergedSlots.filter((item) => cloudSlotIds.has(item.id) || addedSlotIds.has(item.id));
      }
      const base: LocalBlob = {
        ...blob,
        version: Math.max(blob.version || 0, cloud?.version || 0, dataVersionRef.current || 0),
        students: mergedStudents,
        closures: cloud ? mergeById(blob.closures, cloud.closures, incomingNewer) : blob.closures,
        openSlots: mergedSlots,
        requests: dropRemovedRequests(
          cloud ? mergeRequests(blob.requests, cloud.requests) : blob.requests,
          removedRequests
        ),
        announcements: cloud
          ? mergeAnnouncements(blob.announcements, cloud.announcements || [], incomingNewer)
          : blob.announcements || [],
        feedback: dropRemovedFeedback(
          cloud ? mergeFeedback(blob.feedback, cloud.feedback) : blob.feedback || [],
          removedFeedback
        ),
        removedFeedback,
        removedRequests,
        removedOpenSlots,
        ...(cloud ? mergeBanks(incomingNewer ? cloud : blob, incomingNewer ? blob : cloud) : packBanks(blob.bank, blob.banks)),
        accounts: cloud ? mergeCloudAccounts(blob.accounts, cloud.accounts) : blob.accounts,
        removedStudents,
        pushSubscriptions: mergePushSubscriptions(blob.pushSubscriptions, cloud?.pushSubscriptions),
      };
      const next: LocalBlob = {
        ...base,
        ...patch,
        students: liveStudents(
          patch.students
            ? applyStudentWrite(base.students, blob.students, patch.students).filter(
                (s) =>
                  (patch.students || []).some((item) => item.id === s.id) ||
                  !blob.students.some((item) => item.id === s.id)
              )
            : base.students,
          removedStudents
        ),
        closures: patch.closures ?? base.closures,
        openSlots: dropRemovedOpenSlots(
          patch.openSlots !== undefined
            ? mergeOpenSlots(base.openSlots, patch.openSlots, true)
            : base.openSlots,
          mergeRemovedOpenSlots(base.removedOpenSlots, patch.removedOpenSlots)
        ),
        requests: dropRemovedRequests(
          patch.requests
            ? opts?.replace
              ? patch.requests
              : mergeRequests(base.requests, patch.requests)
            : base.requests,
          mergeRemovedRequests(base.removedRequests, patch.removedRequests)
        ),
        announcements:
          patch.announcements !== undefined
            ? mergeAnnouncements(base.announcements, patch.announcements, true)
            : base.announcements || [],
        feedback: dropRemovedFeedback(
          patch.feedback ? mergeFeedback(base.feedback, patch.feedback) : base.feedback,
          mergeRemovedFeedback(base.removedFeedback, patch.removedFeedback)
        ),
        removedFeedback: mergeRemovedFeedback(base.removedFeedback, patch.removedFeedback),
        removedRequests: mergeRemovedRequests(base.removedRequests, patch.removedRequests),
        removedOpenSlots: mergeRemovedOpenSlots(base.removedOpenSlots, patch.removedOpenSlots),
        ...packBanks(
          patch.bank !== undefined ? patch.bank : base.bank,
          patch.banks !== undefined ? patch.banks : base.banks
        ),
        accounts: patch.accounts ?? base.accounts,
        removedStudents,
        pushSubscriptions: mergePushSubscriptions(base.pushSubscriptions, patch.pushSubscriptions),
        sessionUid: uid ?? blob.sessionUid,
        dirty: true,
      };
      next.requests = requestsForLiveStudents(next.requests, next.students);
      if (patch.requests?.length) {
        next.requests = mergeRequests(
          next.requests,
          dropRemovedRequests(patch.requests, next.removedRequests)
        );
      }
      if (patch.feedback?.length) {
        next.feedback = mergeFeedback(next.feedback, patch.feedback);
      }
      next.feedback = dropRemovedFeedback(next.feedback, next.removedFeedback);
      next.requests = dropRemovedRequests(next.requests, next.removedRequests);
      next.openSlots = dropRemovedOpenSlots(next.openSlots, next.removedOpenSlots);
      rememberRemovedFeedback(next.removedFeedback);
      rememberRemovedRequests(next.removedRequests);
      rememberRemovedOpenSlots(next.removedOpenSlots);
      if (patch.sessionUid !== undefined) await rememberUid(patch.sessionUid);
      next.version = Math.max(base.version || 0, blob.version || 0, dataVersionRef.current || 0) + 1;
      dataVersionRef.current = next.version;
      try {
        next.students = await externalizeStudents(next.students);
      } catch {
        // keep local attachments even if a cloud file write is delayed
      }
      await saveDevice(next);
      setStudents((next.students || []).map((s) => normalizeStudent(s)));
      setClosures(next.closures);
      setOpenSlots(next.openSlots);
      setRequests(next.requests || []);
      setAnnouncements(next.announcements || []);
      showFeedback(next.feedback, next.sessionUid, next.accounts, next.removedFeedback);
      applyPacked(next.bank, next.banks);
      const acc = next.accounts.find((a) => a.uid === next.sessionUid) ?? null;
      setUser(acc ? toUser(acc) : null);
    } finally {
      writeLockRef.current -= 1;
    }
    if (opts?.skipCloud) {
      const baseHub = hubBase.current;
      if (baseHub && user?.role === 'instructor') void flushDirty(baseHub);
      return true;
    }
    const saved = await loadDevice();
    const role = saved.accounts.find((a) => a.uid === saved.sessionUid)?.role;
    let hubOk = false;
    if (hubBase.current && role === 'instructor') {
      try {
        await flushDirty(hubBase.current);
        hubOk = Boolean(hubBase.current);
      } catch {
        hubBase.current = null;
        setSyncMode(isCloudConfigured ? 'cloud' : 'device');
      }
    }
    const cloudOk = isCloudConfigured ? await pushCloudSnapshot() : hubOk;
    if (cloudOk) {
      dirtyRef.current = false;
      const local = await loadDevice();
      await saveDevice({ ...local, dirty: false });
      if (!hubBase.current) setSyncMode('cloud');
      return true;
    }
    if (hubOk) return true;
    if (isCloudConfigured) {
      throw new Error('클라우드에 저장하지 못했습니다. 인터넷 연결을 확인한 뒤 다시 시도해 주세요.');
    }
    return true;
  }

  async function currentStudents() {
    if (firebaseOn) return students.map(normalizeStudent);
    const blob = await loadDevice();
    return (blob.students.length ? blob.students : students).map(normalizeStudent);
  }

  async function currentClosures() {
    if (firebaseOn) return closures;
    const blob = await loadDevice();
    return blob.closures?.length ? blob.closures : closures;
  }

  async function currentShared(): Promise<LocalBlob> {
    return loadDevice();
  }

  function requireInstructor() {
    if (user?.role !== 'instructor') throw new Error('강사만 할 수 있습니다.');
  }

  const myStudent = useMemo(() => {
    if (!user || user.role !== 'student') return null;
    return students.find((s) => s.linkedUid === user.uid || s.id === user.studentId) ?? null;
  }, [students, user]);

  const studentRevoked = Boolean(user?.role === 'student' && !myStudent);

  const visibleStudents =
    user?.role === 'instructor'
      ? students
      : students.filter((s) => s.linkedUid === user?.uid || s.id === user?.studentId);

  const visibleClosures =
    user?.role === 'instructor' ? closures : myStudent ? closures.filter(isPublicClosure) : [];

  const claimed = claimedSlotIds(requests);
  const visibleSlots =
    user?.role === 'instructor' || myStudent ? openSlots.filter((slot) => !claimed.has(slot.id)) : [];
  const visibleRequests = user?.role === 'instructor' || myStudent ? requests : [];
  const visibleAnnouncements =
    user?.role === 'instructor'
      ? announcements.filter((item) => !item.deletedAt)
      : myStudent
        ? announcementsForStudent(announcements, myStudent.id, todayIso())
        : [];

  async function rememberUid(uid: string | null) {
    sessionUidRef.current = uid;
    if (uid) await AsyncStorage.setItem(SESSION_KEY, uid);
    else await AsyncStorage.removeItem(SESSION_KEY);
  }

  async function rememberLogin(next: LastLogin) {
    setLastLogin(next);
    await AsyncStorage.setItem(LAST_LOGIN_KEY, JSON.stringify(next));
  }

  async function forgetLogin() {
    setLastLogin(null);
    await AsyncStorage.removeItem(LAST_LOGIN_KEY);
  }

  async function enterAsStudent(name: string, code: string) {
    const joinCode = String(code || '').trim().toUpperCase();
    if (!joinCode) throw new Error('가입코드를 입력해 주세요.');
    await rememberUid(null);
    const previous = await loadDevice();
    if (previous.sessionUid) await saveDevice({ ...previous, sessionUid: null });
    let hubUid: string | null = null;
    if (hubBase.current) {
      try {
        const joined = await hubAuth(hubBase.current, {
          action: 'student-join',
          name,
          code: joinCode,
        });
        hubUid = joined.uid;
      } catch (err) {
        hubBase.current = null;
        setSyncMode(isCloudConfigured ? 'cloud' : 'device');
        const hubMessage = err instanceof Error ? err.message : '';
        if (hubMessage.includes('이름이 레슨생 카드와 같지 않습니다')) throw err;
      }
    }
    const local = await loadDevice();
    const cloud = isCloudConfigured ? await fetchCloud() : null;
    const { card, roster, removed } = resolveStudentJoin(
      local.students,
      cloud?.students,
      local.removedStudents,
      cloud?.removedStudents,
      joinCode,
      (cloud?.version || 0) > (local.version || 0)
    );
    if (!card && joinCodeBlocked(joinCode, roster, removed)) {
      throw new Error('이전에 삭제한 레슨생의 가입코드입니다. 새로 만든 카드의 코드를 입력하세요.');
    }
    if (!card) {
      throw new Error('가입코드가 올바르지 않습니다. 강사에게 받은 코드를 확인하세요.');
    }
    if (name.trim() && normName(card.name) !== normName(name)) {
      throw new Error('이름이 레슨생 카드와 같지 않습니다.');
    }
    let accounts = mergeCloudAccounts(local.accounts, cloud?.accounts || []);
    let acc = accounts.find((a) => a.role === 'student' && a.studentId === card.id);
    if (!acc) {
      acc = {
        uid: hubUid || nid(),
        name: card.name,
        password: joinCode,
        role: 'student',
        studentId: card.id,
      };
      accounts = [...accounts, acc];
    } else if (hubUid && acc.uid !== hubUid) {
      acc = { ...acc, uid: hubUid, password: joinCode, name: card.name };
      accounts = accounts.map((item) => (item.studentId === card.id ? acc! : item));
    }
    const studentsNext = roster.map((s) => (s.id === card.id ? { ...s, linkedUid: acc!.uid } : s));
    await persistShared({
      accounts,
      students: studentsNext,
      removedStudents: removed,
      sessionUid: acc.uid,
    });
    await rememberLogin({ role: 'student', name: card.name, code: joinCode });
  }

  async function finishLocalInstructor(acc: Account) {
    await rememberLogin({ role: 'instructor', name: acc.name });
    await rememberUid(acc.uid);
    const local = await loadDevice();
    await saveDevice({ ...local, sessionUid: acc.uid });
    applyShared(local, acc.uid);
    void applyCloudIfNewer(acc.uid, !(local.students || []).length);
    if (!hubBase.current) {
      void discoverHub().then(async (found) => {
        if (!found || sessionUidRef.current !== acc.uid) return;
        try {
          await attachHub(found);
        } catch {
          hubBase.current = null;
          setSyncMode('device');
        }
      });
    }
  }

  async function enterAsInstructor(name: string, password: string) {
    const typedName = name.trim();
    const typedPassword = password.trim();
    const shared = await loadDevice();
    const acc = shared.accounts.find((a) => {
      if (a.role !== 'instructor') return false;
      if (typedName && normName(a.name) !== normName(typedName)) return false;
      if (typedPassword) return String(a.password || '').trim() === typedPassword;
      return true;
    });
    if (acc) {
      await finishLocalInstructor(acc);
      return;
    }
    if (isCloudConfigured) {
      const cloud = await fetchCloud();
      const cloudAcc = (cloud?.accounts || []).find(
        (a) => a.role === 'instructor' && (!typedName || normName(a.name) === normName(typedName))
      );
      if (cloudAcc && typedPassword && (await instructorPasswordMatches(cloudAcc, typedPassword))) {
        const nextAcc: Account = {
          uid: cloudAcc.uid || nid(),
          name: cloudAcc.name || typedName,
          password: typedPassword,
          role: 'instructor',
          passwordHash: cloudAcc.passwordHash,
        };
        await persistShared({
          accounts: [...shared.accounts.filter((a) => a.role !== 'instructor'), nextAcc],
          students: mergeById(shared.students, cloud?.students || [], true),
          closures: mergeById(shared.closures, cloud?.closures || [], true),
          openSlots: dropRemovedOpenSlots(
            mergeOpenSlots(shared.openSlots, cloud?.openSlots || [], true),
            mergeRemovedOpenSlots(shared.removedOpenSlots, cloud?.removedOpenSlots)
          ),
          removedOpenSlots: mergeRemovedOpenSlots(shared.removedOpenSlots, cloud?.removedOpenSlots),
          requests: mergeRequests(shared.requests, cloud?.requests),
          announcements: mergeAnnouncements(shared.announcements, cloud?.announcements || [], true),
          feedback: mergeFeedback(shared.feedback, cloud?.feedback),
          ...mergeBanks(cloud, shared),
          sessionUid: nextAcc.uid,
        });
        await rememberLogin({ role: 'instructor', name: nextAcc.name });
        if (!hubBase.current) setSyncMode('cloud');
        void discoverHub().then(async (found) => {
          if (!found || sessionUidRef.current !== nextAcc.uid) return;
          try {
            await attachHub(found);
          } catch {
            hubBase.current = null;
            setSyncMode('cloud');
          }
        });
        return;
      }
      if (!hubBase.current) {
        const found = await discoverHub();
        if (found) {
          hubBase.current = found;
          setHubUrl(found);
          await rememberHubUrl(found);
        }
      }
      if (hubBase.current) {
        try {
          const { uid, view } = await hubAuth(hubBase.current, {
            action: 'instructor-login',
            name,
            password,
          });
          await rememberUid(uid);
          await rememberLogin({ role: 'instructor', name: typedName });
          applyShared(view, uid);
          await cacheHubView(view, uid);
          setSyncMode('hub');
          startHubPoll(hubBase.current);
          return;
        } catch (err) {
          const reachable = await probeHub(hubBase.current);
          if (reachable) throw err;
          hubBase.current = null;
          setSyncMode('device');
        }
      }
      throw new Error(
        cloudAcc
          ? '이름 또는 비밀번호가 올바르지 않습니다.'
          : '이 주소에서 강사 로그인을 아직 준비 중입니다. 맥에서 한 번 저장한 뒤 다시 열어 주세요.'
      );
    }
    if (!hubBase.current) {
      const found = await discoverHub();
      if (found) {
        hubBase.current = found;
        setHubUrl(found);
        await rememberHubUrl(found);
      }
    }
    if (hubBase.current) {
      try {
        const { uid, view } = await hubAuth(hubBase.current, {
          action: 'instructor-login',
          name,
          password,
        });
        await rememberUid(uid);
        await rememberLogin({ role: 'instructor', name: typedName });
        applyShared(view, uid);
        await cacheHubView(view, uid);
        setSyncMode('hub');
        startHubPoll(hubBase.current);
        return;
      } catch (err) {
        const reachable = await probeHub(hubBase.current);
        if (reachable) throw err;
        hubBase.current = null;
        setSyncMode('device');
      }
    }
    throw new Error(
      shared.accounts.some((a) => a.role === 'instructor')
        ? '이름 또는 비밀번호가 올바르지 않습니다.'
        : '이 기기에 강사 계정이 없습니다. 공개 주소에서 이름과 비밀번호로 들어오면 됩니다.'
    );
  }

  async function enterFirebaseStudent(name: string, code: string) {
    const joinCode = code.trim().toUpperCase();
    const codeSnap = await getDoc(doc(db!, 'joinCodes', joinCode));
    if (!codeSnap.exists()) throw new Error('가입코드가 올바르지 않습니다. 강사에게 받은 코드를 확인하세요.');
    const studentId = codeSnap.data().studentId as string;
    const listedName = (codeSnap.data().name as string | undefined) ?? '';
    if (listedName && name.trim() && normName(listedName) !== normName(name)) {
      throw new Error('이름이 레슨생 카드와 같지 않습니다.');
    }
    const mail = studentMail(joinCode);
    try {
      await signInWithEmailAndPassword(auth!, mail, joinCode);
    } catch {
      const cred = await createUserWithEmailAndPassword(auth!, mail, joinCode);
      await setDoc(doc(db!, 'users', cred.user.uid), {
        name: name.trim() || listedName || '레슨생',
        role: 'student',
        studentId,
      });
      const studentRef = doc(db!, 'students', studentId);
      const studentSnap = await getDoc(studentRef);
      const st = studentSnap.data() as Student | undefined;
      if (st && !st.linkedUid) {
        await updateDoc(studentRef, { linkedUid: cred.user.uid });
      }
    }
    await rememberLogin({ role: 'student', name: name.trim() || listedName || '레슨생', code: joinCode });
  }

  const api: Store = {
    ready,
    firebaseOn,
    cloudOn: isCloudConfigured,
    syncMode,
    user,
    students: visibleStudents,
    closures: visibleClosures,
    openSlots: visibleSlots,
    requests: visibleRequests,
    announcements: visibleAnnouncements,
    feedback: user?.role === 'instructor' ? feedback : [],
    bank,
    banks,
    error,
    myStudent,
    studentRevoked,
    hubUrl,
    lastLogin,
    async clearLastLogin() {
      await forgetLogin();
    },
    async connectHub(url) {
      try {
        const base = await probeHub(url);
        if (!base) return false;
        await rememberHubUrl(base);
        hubBase.current = base;
        setHubUrl(base);
        setSyncMode('hub');
        return true;
      } catch {
        return false;
      }
    },
    async signIn(input) {
      setError(null);
      if (input.role === 'student') {
        if (firebaseOn) {
          await enterFirebaseStudent(input.name, input.code);
          return;
        }
        await enterAsStudent(input.name, input.code);
        return;
      }
      if (firebaseOn) {
        await signInWithEmailAndPassword(auth!, instructorMail(input.name), input.password);
        await rememberLogin({ role: 'instructor', name: input.name.trim() });
        return;
      }
      await enterAsInstructor(input.name, input.password);
    },
    async signUp(input) {
      setError(null);
      if (input.role === 'student') {
        await api.signIn(input);
        return;
      }
      if (input.code.trim() !== INSTRUCTOR_INVITE_CODE) {
        throw new Error('강사 코드가 올바르지 않습니다.');
      }
      if (input.password.trim().length < 4) {
        throw new Error('비밀번호는 4자 이상으로 해 주세요.');
      }
      if (firebaseOn) {
        const cred = await createUserWithEmailAndPassword(
          auth!,
          instructorMail(input.name),
          input.password
        );
        await setDoc(doc(db!, 'users', cred.user.uid), {
          name: input.name.trim(),
          role: 'instructor',
        });
        await rememberLogin({ role: 'instructor', name: input.name.trim() });
        return;
      }
      if (hubBase.current) {
        const { uid, view } = await hubAuth(hubBase.current, {
          action: 'instructor-signup',
          name: input.name,
          code: input.code,
          password: input.password,
        });
        await rememberUid(uid);
        applyShared(view, uid);
        return;
      }
      const shared = await loadDevice();
      const existing = shared.accounts.find((a) => a.role === 'instructor');
      if (existing) {
        const nextAccounts = shared.accounts.map((a) =>
          a.role === 'instructor'
            ? { ...a, name: input.name.trim() || a.name, password: input.password.trim() }
            : a
        );
        await persistShared({ accounts: nextAccounts, sessionUid: existing.uid });
        return;
      }
      const acc: Account = {
        uid: nid(),
        name: input.name.trim(),
        password: input.password.trim(),
        role: 'instructor',
      };
      await persistShared({
        accounts: [...shared.accounts, acc],
        sessionUid: acc.uid,
      });
    },
    async signOut() {
      if (firebaseOn) {
        await fbSignOut(auth!);
        return;
      }
      await rememberUid(null);
      setUser(null);
      setStudents([]);
      setClosures([]);
      setOpenSlots([]);
      setRequests([]);
      setAnnouncements([]);
      setFeedback([]);
      removedFeedbackRef.current = [];
      removedRequestsRef.current = [];
      removedOpenSlotsRef.current = [];
    },
    async deleteMyAccount() {
      if (!user) return;
      if (firebaseOn) {
        if (user.role === 'student' && user.studentId) {
          await updateDoc(doc(db!, 'students', user.studentId), { linkedUid: null });
        }
        await deleteDoc(doc(db!, 'users', user.uid));
        if (auth!.currentUser) await deleteUser(auth!.currentUser);
        return;
      }
      if (hubBase.current) {
        const { view } = await hubAuth(hubBase.current, { action: 'leave', uid: user.uid });
        await rememberUid(null);
        applyShared(view, null);
        return;
      }
      const shared = await loadDevice();
      const studentsNext =
        user.role === 'student'
          ? shared.students.map((s) =>
              s.linkedUid === user.uid || s.id === user.studentId ? { ...s, linkedUid: null } : s
            )
          : shared.students;
      await persistShared({
        accounts: shared.accounts.filter((a) => a.uid !== user.uid),
        students: studentsNext,
        sessionUid: null,
      });
    },
    async removeStudent(id) {
      requireInstructor();
      if (firebaseOn) {
        const snap = await getDoc(doc(db!, 'students', id));
        const st = snap.data() as Student | undefined;
        if (st?.joinCode) await deleteDoc(doc(db!, 'joinCodes', st.joinCode));
        await deleteDoc(doc(db!, 'students', id));
        return;
      }
      if (hubBase.current) {
        try {
          const { view } = await hubAuth(hubBase.current, {
            action: 'remove-student',
            uid: user?.uid,
            studentId: id,
          });
          applyShared(view, user?.uid ?? null);
          await cacheHubView(view, user?.uid || '');
          await pushCloudSnapshot();
          return;
        } catch {
          hubBase.current = null;
          setSyncMode(isCloudConfigured ? 'cloud' : 'device');
        }
      }
      const shared = await loadDevice();
      await persistShared(applyRemoveStudent(shared, id, nowIso()));
    },
    async addStudent(input) {
      requireInstructor();
      const student = blankStudent(
        nid(),
        input.name,
        input.weekday,
        normalizeTime(input.time),
        input.startCycle,
        input.firstDate
      );
      if (firebaseOn) {
        await setDoc(doc(db!, 'students', student.id), student);
        await setDoc(doc(db!, 'joinCodes', student.joinCode), {
          studentId: student.id,
          name: student.name,
        });
        return student;
      }
      const shared = await currentShared();
      const cloud = isCloudConfigured ? await fetchCloud() : null;
      const ready = {
        ...student,
        joinCode: unusedJoinCode(
          mergeStudents(shared.students, cloud?.students || [], true),
          mergeRemovedStudents(shared.removedStudents, cloud?.removedStudents)
        ),
        sessions: postponeOverlaps(student.sessions, student.time, shared.closures, student.weekday),
      };
      await persistShared({ students: [...shared.students.map(normalizeStudent), ready] });
      return ready;
    },
    async patchStudent(id, patch) {
      requireInstructor();
      if (firebaseOn) {
        await updateDoc(doc(db!, 'students', id), patch);
        return;
      }
      const shared = await currentShared();
      await persistShared({
        students: shared.students.map((s) => (s.id === id ? normalizeStudent({ ...s, ...patch }) : normalizeStudent(s))),
      });
    },
    async setSessionStatus(studentId, sessionId, status) {
      requireInstructor();
      const list = await currentStudents();
      const st = list.find((s) => s.id === studentId);
      if (!st) return;
      const sessions = st.sessions.map((s) => (s.id === sessionId ? applyAttendance(s, status) : s));
      await api.patchStudent(studentId, { sessions });
    },
    async setMyAbsence(sessionId, absent) {
      if (!user || user.role !== 'student') throw new Error('레슨생만 불참석을 표시할 수 있습니다.');
      const st = students.find((s) => s.linkedUid === user.uid || s.id === user.studentId);
      if (!st) return;
      const sessions = st.sessions.map((s) => {
        if (s.id !== sessionId) return s;
        if (s.status === 'cancelled') return s;
        return { ...s, status: (absent ? 'absent' : 'pending') as SessionStatus };
      });
      if (firebaseOn) {
        await updateDoc(doc(db!, 'students', st.id), { sessions });
        return;
      }
      if (hubBase.current) {
        try {
          await hubAuth(hubBase.current, {
            action: 'student-absent',
            uid: user.uid,
            sessionId,
            absent: absent ? '1' : '0',
          });
          const view = await fetchBlob(hubBase.current, user.uid);
          applyShared(view, user.uid);
          return;
        } catch {
          hubBase.current = null;
          setSyncMode(isCloudConfigured ? 'cloud' : 'device');
        }
      }
      const shared = await loadDevice();
      await persistShared({
        students: shared.students.map((s) => (s.id === st.id ? { ...s, sessions } : s)),
      });
    },
    async setSessionDate(studentId, sessionId, date, time) {
      requireInstructor();
      const list = await currentStudents();
      const st = list.find((s) => s.id === studentId);
      if (!st) return;
      await api.patchStudent(studentId, {
        sessions: retargetFollowing(st.sessions, sessionId, date, time),
      });
    },
    async setSessionTime(studentId, sessionId, time) {
      requireInstructor();
      const list = await currentStudents();
      const found = list.find((s) => s.id === studentId);
      if (!found) return;
      const st = normalizeStudent(found);
      const nextTime = normalizeTime(time);
      const holidays = await currentClosures();
      const sessions = st.sessions.map((s) => (s.id === sessionId ? { ...s, time: nextTime } : s));
      await api.patchStudent(studentId, {
        sessions: postponeOverlaps(sessions, st.time, holidays, st.weekday),
      });
    },
    async setFixedTime(studentId, time) {
      requireInstructor();
      const list = await currentStudents();
      const found = list.find((s) => s.id === studentId);
      if (!found) return;
      const st = normalizeStudent(found);
      const nextTime = normalizeTime(time);
      const sessions = st.sessions.map((s) => {
        if (s.status === 'cancelled' || s.status === 'attended' || s.status === 'absent') return s;
        if (s.makeup?.status === 'done' || s.makeup?.status === 'absent') return s;
        if (s.time && s.time !== st.time) return s;
        return { ...s, time: nextTime };
      });
      await api.patchStudent(studentId, {
        time: nextTime,
        weeklyTime: formatWeekly(st.weekday, nextTime),
        sessions,
      });
    },
    async applyLessonSetup(studentId, input) {
      requireInstructor();
      const list = await currentStudents();
      const st = list.find((s) => s.id === studentId);
      if (!st) return;
      const next = applyLessonSetup(normalizeStudent(st), input, await currentClosures());
      await api.patchStudent(studentId, {
        weekday: next.weekday,
        time: next.time,
        weeklyTime: next.weeklyTime,
        startCycle: next.startCycle,
        sessions: next.sessions,
      });
    },
    async applyFirstDate(studentId, firstDate, time) {
      const list = await currentStudents();
      const st = list.find((s) => s.id === studentId);
      if (!st) return;
      await api.applyLessonSetup(studentId, {
        weekday: st.weekday,
        time: time || st.time,
        startCycle: st.startCycle,
        firstDate,
      });
    },
    async applyFixedSchedule(studentId, input) {
      await api.applyLessonSetup(studentId, { ...input, applyTime: true });
    },
    async addSession(studentId, afterSessionId, cycle) {
      requireInstructor();
      const list = await currentStudents();
      const found = list.find((s) => s.id === studentId);
      if (!found) return;
      const st = normalizeStudent(found);
      const holidays = await currentClosures();
      if (!afterSessionId) {
        const next = appendContinuingSessions(st.sessions, 1, {
          weekday: st.weekday,
          time: st.time,
          startCycle: st.startCycle,
          cycle,
          closures: holidays,
        });
        await api.patchStudent(studentId, {
          sessions: postponeOverlaps(next, st.time, holidays, st.weekday),
        });
        return;
      }
      const after = st.sessions.find((s) => s.id === afterSessionId);
      const inserted = insertSessionAfter(st.sessions, afterSessionId, {
        time: after?.time || st.time,
        weekday: st.weekday,
        startCycle: st.startCycle,
        closures: holidays,
      });
      await api.patchStudent(studentId, {
        sessions: postponeOverlaps(inserted, st.time, holidays, st.weekday),
      });
    },
    async removeSession(studentId, sessionId) {
      requireInstructor();
      const list = await currentStudents();
      const found = list.find((s) => s.id === studentId);
      if (!found) return;
      const st = normalizeStudent(found);
      const holidays = await currentClosures();
      const remaining = removeSessionById(st.sessions, sessionId);
      const before = sequenceSessions(st.sessions.filter((s) => s.status !== 'cancelled'));
      const removedAt = before.findIndex((s) => s.id === sessionId);
      const prev = removedAt > 0 ? before[removedAt - 1] : sequenceSessions(remaining.filter((s) => s.status !== 'cancelled'))[0];
      const aligned = realignAfter(remaining, prev?.id, {
        weekday: st.weekday,
        time: st.time,
        closures: holidays,
      });
      await api.patchStudent(studentId, {
        sessions: postponeOverlaps(aligned, st.time, holidays, st.weekday),
        removedSessionIds: mergeRemovedSessionIds(st.removedSessionIds, [sessionId]),
      });
    },
    async setMakeup(studentId, sessionId, makeup) {
      requireInstructor();
      const list = await currentStudents();
      const st = list.find((s) => s.id === studentId);
      if (!st) return;
      const holidays = await currentClosures();
      const next = applyMakeupReplacement(normalizeStudent(st), sessionId, makeup, holidays);
      await api.patchStudent(studentId, { sessions: next.sessions });
    },
    async setInstructorNote(studentId, sessionId, note) {
      requireInstructor();
      const list = await currentStudents();
      const st = list.find((s) => s.id === studentId);
      if (!st) return;
      await api.patchStudent(studentId, {
        sessions: st.sessions.map((s) => (s.id === sessionId ? { ...s, note } : s)),
      });
    },
    async setStudentNote(sessionId, note) {
      if (!user || user.role !== 'student') throw new Error('레슨생만 내 메모를 쓸 수 있습니다.');
      if (firebaseOn) {
        const st = students.find((s) => s.linkedUid === user.uid || s.id === user.studentId);
        if (!st) return;
        await updateDoc(doc(db!, 'students', st.id), {
          sessions: st.sessions.map((sess) => (sess.id === sessionId ? { ...sess, studentNote: note } : sess)),
        });
        return;
      }
      if (hubBase.current) {
        try {
          await hubAuth(hubBase.current, {
            action: 'student-note',
            uid: user.uid,
            sessionId,
            note,
          });
          applyShared(await fetchBlob(hubBase.current, user.uid), user.uid);
          return;
        } catch {
          hubBase.current = null;
          setSyncMode(isCloudConfigured ? 'cloud' : 'device');
        }
      }
      const st = students.find((s) => s.linkedUid === user.uid || s.id === user.studentId);
      if (!st) return;
      const shared = await loadDevice();
      await persistShared({
        students: shared.students.map((s) =>
          s.id === st.id
            ? {
                ...s,
                sessions: s.sessions.map((sess) => (sess.id === sessionId ? { ...sess, studentNote: note } : sess)),
              }
            : s
        ),
      });
    },
    async setChecklistItem(sessionId, itemId, checked) {
      if (!user || user.role !== 'student') throw new Error('레슨생만 체크리스트를 수정할 수 있습니다.');
      const stamp = new Date().toISOString();
      const patchSession = (sess: LessonSession) => {
        if (sess.id !== sessionId) return sess;
        const checklistChecked = toggleChecklistChecked(sess.checklistChecked, itemId, checked);
        return { ...sess, checklistChecked, updatedAt: stamp };
      };
      if (firebaseOn) {
        const st = students.find((s) => s.linkedUid === user.uid || s.id === user.studentId);
        if (!st) return;
        await updateDoc(doc(db!, 'students', st.id), {
          sessions: st.sessions.map(patchSession),
        });
        return;
      }
      if (hubBase.current) {
        try {
          await hubAuth(hubBase.current, {
            action: 'student-checklist',
            uid: user.uid,
            sessionId,
            itemId,
            checked,
          });
          applyShared(await fetchBlob(hubBase.current, user.uid), user.uid);
          return;
        } catch {
          hubBase.current = null;
          setSyncMode(isCloudConfigured ? 'cloud' : 'device');
        }
      }
      const st = students.find((s) => s.linkedUid === user.uid || s.id === user.studentId);
      if (!st) return;
      const shared = await loadDevice();
      await persistShared({
        students: shared.students.map((s) =>
          s.id === st.id ? { ...s, sessions: s.sessions.map(patchSession) } : s
        ),
      });
    },
    async addSessionFile(studentId, sessionId, readyFile) {
      requireInstructor();
      const file = readyFile || (await pickAndUploadSessionFile(hubBase.current));
      if (!file) return;
      const list = await currentStudents();
      const st = list.find((s) => s.id === studentId);
      if (!st) return;
      await api.patchStudent(studentId, {
        sessions: st.sessions.map((s) =>
          s.id === sessionId
            ? { ...s, attachments: [...(s.attachments || []), file], updatedAt: new Date().toISOString() }
            : s
        ),
      });
    },
    async removeSessionFile(studentId, sessionId, fileId) {
      requireInstructor();
      const list = await currentStudents();
      const st = list.find((s) => s.id === studentId);
      if (!st) return;
      const removed = (st.sessions.find((s) => s.id === sessionId)?.attachments || []).find((f) => f.id === fileId);
      if (removed?.uri && isFilePointer(removed.uri)) {
        try {
          await releaseFilePointer(removed.uri);
        } catch {
          // session delete still proceeds
        }
      }
      await api.patchStudent(studentId, {
        sessions: st.sessions.map((s) =>
          s.id === sessionId
            ? {
                ...s,
                attachments: (s.attachments || []).filter((f) => f.id !== fileId),
                removedAttachmentIds: [...new Set([...(s.removedAttachmentIds || []), fileId].filter(Boolean))],
                updatedAt: new Date().toISOString(),
              }
            : s
        ),
      });
    },
    async setMakeupStatus(studentId, sessionId, status) {
      requireInstructor();
      const list = await currentStudents();
      const st = list.find((s) => s.id === studentId);
      if (!st) return;
      const sessions = st.sessions.map((s) => {
        if (s.id !== sessionId || !s.makeup) return s;
        return { ...s, makeup: { ...s.makeup, status } };
      });
      await api.patchStudent(studentId, { sessions });
    },
    async addClosure(input) {
      requireInstructor();
      const start = input.endDate && input.endDate < input.date ? input.endDate : input.date;
      const end = input.endDate && input.endDate < input.date ? input.date : input.endDate || input.date;
      const item: Closure = { ...input, id: nid(), date: start, endDate: end, scope: input.scope || 'all' };
      const shared = await currentShared();
      const roster = shared.students.map(normalizeStudent);
      const studentsNext = applyAllHolidays(roster, [item, ...shared.closures]);
      if (firebaseOn) {
        await setDoc(doc(db!, 'closures', item.id), item);
        for (const st of studentsNext) {
          await updateDoc(doc(db!, 'students', st.id), { sessions: st.sessions });
        }
        notifyClosureStudents(item, roster);
        return;
      }
      await persistShared({ closures: [item, ...shared.closures], students: studentsNext });
      notifyClosureStudents(item, roster);
    },
    async removeClosure(id) {
      requireInstructor();
      if (firebaseOn) {
        await deleteDoc(doc(db!, 'closures', id));
        return;
      }
      const shared = await currentShared();
      await persistShared({ closures: shared.closures.filter((c) => c.id !== id) });
    },
    async addOpenSlot(input) {
      requireInstructor();
      const item: OpenSlot = { ...input, id: nid() };
      if (firebaseOn) {
        await setDoc(doc(db!, 'openSlots', item.id), item);
      } else {
        const shared = await currentShared();
        await persistShared({ openSlots: [item, ...shared.openSlots] });
      }
      notifyOpenSlotStudents(item, students);
    },
    async removeOpenSlot(id) {
      requireInstructor();
      if (firebaseOn) {
        await deleteDoc(doc(db!, 'openSlots', id));
        return;
      }
      const shared = await currentShared();
      const removedOpenSlots = mergeRemovedOpenSlots(shared.removedOpenSlots, [id]);
      await persistShared({
        openSlots: dropRemovedOpenSlots(shared.openSlots.filter((s) => s.id !== id), removedOpenSlots),
        removedOpenSlots,
      });
    },
    async requestMakeup(slotId, sessionId) {
      if (!user || user.role !== 'student') throw new Error('레슨생만 보강을 신청할 수 있습니다.');
      const st = students.find((s) => s.linkedUid === user.uid || s.id === user.studentId);
      if (!st) throw new Error('연결된 레슨 카드가 없습니다.');
      const slot = openSlots.find((s) => s.id === slotId);
      const session = st.sessions.find((s) => s.id === sessionId);
      if (!slot) throw new Error('보강 가능 시간을 찾을 수 없습니다.');
      if (!session) throw new Error('바꿀 레슨 회차를 찾을 수 없습니다.');
      if (session.status === 'cancelled') throw new Error('휴강 회차는 보강으로 바꿀 수 없습니다.');
      if (session.status === 'attended') throw new Error('이미 출석한 회차는 보강으로 바꿀 수 없습니다.');
      const blocked = makeupRequestBlockReason(session, slot.date);
      if (blocked) throw new Error(blocked);
      const open = findReusableMakeup(requests, st.id, session.id);
      if (open) {
        await api.changeMakeup(open.id, slotId, sessionId);
        return;
      }
      if (
        requests.some(
          (r) =>
            r.status === 'pending' &&
            makeupIntent(r) === 'apply' &&
            r.studentId === st.id &&
            r.slotId === slot.id
        )
      ) {
        throw new Error('이미 이 회차 또는 이 시간에 보강을 신청했습니다.');
      }
      const createdAt = nowIso();
      const item: MakeupRequest = {
        id: nid(),
        studentId: st.id,
        studentName: st.name,
        sessionId: session.id,
        sessionDate: session.date || '',
        sessionCycle: Number(session.cycle || 1),
        slotId: slot.id,
        date: slot.date,
        time: slot.startTime,
        endTime: slot.endTime,
        status: 'pending',
        intent: 'apply',
        createdAt,
        updatedAt: createdAt,
      };
      if (firebaseOn) {
        await setDoc(doc(db!, 'makeupRequests', item.id), item);
        notifyRemotePush(makeupInstructorPush(item));
        return;
      }
      writeGenRef.current += 1;
      if (hubBase.current) {
        try {
          const { view } = await hubAuth(hubBase.current, {
            action: 'request-makeup',
            uid: user.uid,
            slotId,
            sessionId,
          });
          applyShared(view, user.uid);
          await cacheHubView(view, user.uid);
          await pushCloudSnapshot();
          notifyRemotePush(makeupInstructorPush(item));
          return;
        } catch {
          hubBase.current = null;
          setSyncMode(isCloudConfigured ? 'cloud' : 'device');
        }
      }
      const shared = await currentShared();
      try {
        await persistShared({ requests: [item] });
        notifyRemotePush(makeupInstructorPush(item));
      } catch {
        await persistShared({ requests: shared.requests || [] }, { skipCloud: true, replace: true });
        throw new Error('강사에게 신청을 보내지 못했습니다. 잠시 후 다시 시도해 주세요.');
      }
    },
    async changeMakeup(requestId, slotId, sessionId) {
      if (!user || user.role !== 'student') throw new Error('레슨생만 보강 신청을 바꿀 수 있습니다.');
      const st = students.find((s) => s.linkedUid === user.uid || s.id === user.studentId);
      if (!st) throw new Error('연결된 레슨 카드가 없습니다.');
      const slot = openSlots.find((s) => s.id === slotId);
      const session = st.sessions.find((s) => s.id === sessionId);
      if (!slot) throw new Error('보강 가능 시간을 찾을 수 없습니다.');
      if (!session) throw new Error('바꿀 레슨 회차를 찾을 수 없습니다.');
      if (session.status === 'cancelled') throw new Error('휴강 회차는 보강으로 바꿀 수 없습니다.');
      if (session.status === 'attended') throw new Error('이미 출석한 회차는 보강으로 바꿀 수 없습니다.');
      const blocked = makeupRequestBlockReason(session, slot.date);
      if (blocked) throw new Error(blocked);
      if (firebaseOn) {
        const req = requests.find((r) => r.id === requestId);
        if (!req) throw new Error('바꿀 신청이 없습니다.');
        await updateDoc(doc(db!, 'makeupRequests', requestId), applyStudentChange(req, slot, session));
        notifyRemotePush(makeupInstructorPush({ ...req, ...applyStudentChange(req, slot, session) }));
        return;
      }
      writeGenRef.current += 1;
      if (hubBase.current) {
        try {
          const { view } = await hubAuth(hubBase.current, {
            action: 'change-makeup',
            uid: user.uid,
            requestId,
            slotId,
            sessionId,
          });
          applyShared(view, user.uid);
          await cacheHubView(view, user.uid);
          await pushCloudSnapshot();
          const changed = (view.requests || []).find((r) => r.id === requestId);
          if (changed) notifyRemotePush(makeupInstructorPush(changed));
          return;
        } catch {
          hubBase.current = null;
          setSyncMode(isCloudConfigured ? 'cloud' : 'device');
        }
      }
      const shared = await currentShared();
      const req = (shared.requests || []).find((r) => r.id === requestId);
      if (!req) throw new Error('바꿀 신청이 없습니다.');
      try {
        const next = applyStudentChange(req, slot, session);
        await persistShared({
          requests: (shared.requests || []).map((r) => (r.id === requestId ? next : r)),
        });
        notifyRemotePush(makeupInstructorPush(next));
      } catch {
        await persistShared({ requests: shared.requests || [] }, { skipCloud: true, replace: true });
        throw new Error('강사에게 변경을 보내지 못했습니다. 잠시 후 다시 시도해 주세요.');
      }
    },
    async withdrawMakeup(requestId) {
      if (!user || user.role !== 'student') throw new Error('레슨생만 보강 신청을 철회할 수 있습니다.');
      const current = requests.find((r) => r.id === requestId);
      if (!current) throw new Error('철회할 신청이 없습니다.');
      const blocked = makeupWithdrawBlockReason(current);
      if (blocked) throw new Error(blocked);
      if (firebaseOn) {
        const req = requests.find((r) => r.id === requestId);
        if (!req) throw new Error('철회할 신청이 없습니다.');
        await updateDoc(doc(db!, 'makeupRequests', requestId), applyStudentWithdraw(req));
        notifyRemotePush(makeupInstructorPush(applyStudentWithdraw(req)));
        return;
      }
      writeGenRef.current += 1;
      if (hubBase.current) {
        try {
          const { view } = await hubAuth(hubBase.current, {
            action: 'withdraw-makeup',
            uid: user.uid,
            requestId,
          });
          applyShared(view, user.uid);
          await cacheHubView(view, user.uid);
          await pushCloudSnapshot();
          const withdrawn = (view.requests || []).find((r) => r.id === requestId);
          if (withdrawn) notifyRemotePush(makeupInstructorPush(withdrawn));
          return;
        } catch {
          hubBase.current = null;
          setSyncMode(isCloudConfigured ? 'cloud' : 'device');
        }
      }
      const shared = await currentShared();
      const req = (shared.requests || []).find((r) => r.id === requestId);
      if (!req) throw new Error('철회할 신청이 없습니다.');
      try {
        const next = applyStudentWithdraw(req);
        await persistShared({
          requests: (shared.requests || []).map((r) => (r.id === requestId ? next : r)),
        });
        notifyRemotePush(makeupInstructorPush(next));
      } catch {
        await persistShared({ requests: shared.requests || [] }, { skipCloud: true, replace: true });
        throw new Error('강사에게 철회를 보내지 못했습니다. 잠시 후 다시 시도해 주세요.');
      }
    },
    async sendAnnouncement(input) {
      requireInstructor();
      const title = input.title.trim() || '쟝쟝 공지사항';
      const body = input.body.trim();
      const expiresOn = input.expiresOn.trim();
      if (!body) throw new Error('공지 내용을 입력해 주세요.');
      if (!expiresOn) throw new Error('공지 표시 종료일을 선택해 주세요.');
      if (expiresOn < todayIso()) throw new Error('공지 표시 종료일은 오늘 이후로 선택해 주세요.');
      const roster = await currentStudents();
      const liveIds = new Set(roster.map((student) => student.id));
      const studentIds = [...new Set(input.studentIds.map((id) => String(id || '').trim()))].filter(
        (id) => id && liveIds.has(id)
      );
      if (!studentIds.length) throw new Error('공지사항을 받을 레슨생을 선택해 주세요.');
      const item: Announcement = {
        id: nid(),
        title,
        body,
        studentIds,
        createdAt: nowIso(),
        expiresOn,
      };
      if (firebaseOn) {
        await setDoc(doc(db!, 'announcements', item.id), item);
      } else {
        await persistShared({ announcements: [item] });
      }
      const targets = roster.filter((student) => studentIds.includes(student.id));
      try {
        const result = await sendCloudPush({
          audience: 'students',
          studentIds,
          linkedUids: targets
            .map((student) => student.linkedUid)
            .filter((uid): uid is string => Boolean(uid)),
          title,
          body,
          url: '/',
          tag: `announcement-${item.id}`,
        });
        return result.sent;
      } catch {
        return 0;
      }
    },
    async removeAnnouncement(id) {
      requireInstructor();
      const clean = String(id || '').trim();
      if (!clean) return;
      const current = announcements.find((item) => item.id === clean);
      if (!current || current.deletedAt) return;
      const removed: Announcement = { ...current, deletedAt: nowIso() };
      if (firebaseOn) {
        await updateDoc(doc(db!, 'announcements', clean), { deletedAt: removed.deletedAt });
        return;
      }
      await persistShared({ announcements: [removed] });
    },
    async sendFeedback(text) {
      if (!user || user.role !== 'student') throw new Error('레슨생만 피드백을 보낼 수 있습니다.');
      const st = students.find((s) => s.linkedUid === user.uid || s.id === user.studentId);
      if (!st) throw new Error('연결된 레슨 카드가 없습니다.');
      const item = sanitizeFeedback({
        id: nid(),
        body: text,
        createdAt: nowIso(),
      });
      if (!item) throw new Error('내용을 적어 주세요.');
      if (firebaseOn) {
        await setDoc(doc(db!, 'feedback', item.id), item);
        notifyRemotePush(feedbackInstructorPush());
        return;
      }
      writeGenRef.current += 1;
      if (hubBase.current) {
        try {
          const { view } = await hubAuth(hubBase.current, {
            action: 'send-feedback',
            uid: user.uid,
            body: item.body,
          });
          applyShared(view, user.uid);
          await cacheHubView(view, user.uid);
          const local = await currentShared();
          await saveDevice({
            ...local,
            feedback: mergeFeedback(local.feedback, [item]),
          });
          feedbackRef.current = mergeFeedback(feedbackRef.current, [item]);
          await pushCloudSnapshot();
          notifyRemotePush(feedbackInstructorPush());
          return;
        } catch {
          hubBase.current = null;
          setSyncMode(isCloudConfigured ? 'cloud' : 'device');
        }
      }
      const shared = await currentShared();
      try {
        await persistShared({ feedback: mergeFeedback(shared.feedback, [item]) });
        notifyRemotePush(feedbackInstructorPush());
      } catch {
        await persistShared({ feedback: shared.feedback || [] }, { skipCloud: true });
        throw new Error('강사에게 피드백을 보내지 못했습니다. 잠시 후 다시 시도해 주세요.');
      }
    },
    async removeFeedback(id) {
      requireInstructor();
      const clean = String(id || '').trim();
      if (!clean) return;
      if (firebaseOn) {
        await deleteDoc(doc(db!, 'feedback', clean));
        return;
      }
      const removedFeedback = mergeRemovedFeedback(removedFeedbackRef.current, [clean]);
      rememberRemovedFeedback(removedFeedback);
      setFeedback(dropRemovedFeedback(feedbackRef.current, removedFeedback));
      writeGenRef.current += 1;
      if (hubBase.current && user) {
        try {
          const { view } = await hubAuth(hubBase.current, {
            action: 'remove-feedback',
            uid: user.uid,
            id: clean,
          });
          applyShared(view, user.uid);
          await cacheHubView(view, user.uid);
          const local = await currentShared();
          await saveDevice({
            ...local,
            feedback: dropRemovedFeedback(local.feedback, removedFeedback),
            removedFeedback,
          });
          await pushCloudSnapshot();
          return;
        } catch {
          hubBase.current = null;
          setSyncMode(isCloudConfigured ? 'cloud' : 'device');
        }
      }
      const shared = await currentShared();
      await persistShared({
        feedback: dropRemovedFeedback(shared.feedback, removedFeedback),
        removedFeedback,
      });
    },
    async decideMakeup(requestId, accepted) {
      requireInstructor();
      if (firebaseOn) {
        const req = requests.find((r) => r.id === requestId);
        if (!req || req.status !== 'pending') return;
        const nextRequests = applyDecideToRequests(requests, req, accepted);
        const nextSlots = applyDecideToSlots(openSlots, req, accepted, nextRequests);
        for (const item of nextRequests) {
          if (item.id === req.id || item.updatedAt !== requests.find((r) => r.id === item.id)?.updatedAt) {
            await updateDoc(doc(db!, 'makeupRequests', item.id), item);
          }
        }
        for (const slot of openSlots) {
          if (!nextSlots.some((s) => s.id === slot.id)) {
            await deleteDoc(doc(db!, 'openSlots', slot.id));
          }
        }
        for (const slot of nextSlots) {
          if (!openSlots.some((s) => s.id === slot.id)) {
            await setDoc(doc(db!, 'openSlots', slot.id), slot);
          }
        }
        if (accepted && makeupIntent(req) === 'apply') {
          await api.setMakeup(req.studentId, req.sessionId, { date: req.date, time: req.time, status: 'planned' });
        } else if (accepted && makeupIntent(req) === 'withdraw') {
          await api.setMakeup(req.studentId, req.sessionId, null);
        } else if (accepted && makeupIntent(req) === 'change') {
          if (req.previousSessionId && req.previousSessionId !== req.sessionId) {
            await api.setMakeup(req.studentId, req.previousSessionId, null);
          }
          await api.setMakeup(req.studentId, req.sessionId, { date: req.date, time: req.time, status: 'planned' });
        }
        notifyRemotePush(
          makeupStudentPush(
            req,
            accepted ? '보강 수락' : '보강 거절',
            accepted ? '신청한 보강이 수락되었습니다.' : '신청한 보강이 거절되었습니다.'
          )
        );
        return;
      }
      if (hubBase.current) {
        try {
          const { view } = await hubAuth(hubBase.current, {
            action: 'decide-makeup',
            uid: user?.uid,
            requestId,
            accepted,
          });
          applyShared(view, user?.uid ?? null);
          await cacheHubView(view, user?.uid || '');
          await pushCloudSnapshot();
          notifyRemotePush(
            makeupStudentPush(
              { id: requestId, studentId: (view.requests || []).find((r) => r.id === requestId)?.studentId || '' },
              accepted ? '보강 수락' : '보강 거절',
              accepted ? '신청한 보강이 수락되었습니다.' : '신청한 보강이 거절되었습니다.'
            )
          );
          return;
        } catch {
          hubBase.current = null;
          setSyncMode(isCloudConfigured ? 'cloud' : 'device');
        }
      }
      const shared = await currentShared();
      const req = (shared.requests || []).find((r) => r.id === requestId);
      if (!req || req.status !== 'pending') return;
      const nextRequests = applyDecideToRequests(shared.requests || [], req, accepted);
      await persistShared({
        requests: nextRequests,
        students: applyDecideToStudents(shared.students, req, accepted, shared.closures),
        openSlots: applyDecideToSlots(shared.openSlots || [], req, accepted, nextRequests),
      });
      notifyRemotePush(
        makeupStudentPush(
          req,
          accepted ? '보강 수락' : '보강 거절',
          accepted ? '신청한 보강이 수락되었습니다.' : '신청한 보강이 거절되었습니다.'
        )
      );
    },
    async reviseMakeup(requestId, action) {
      requireInstructor();
      const nextAction = action as MakeupReviseAction;
      if (nextAction !== 'accept' && nextAction !== 'decline' && nextAction !== 'withdraw') {
        throw new Error('수정할 수 없는 요청입니다.');
      }
      if (firebaseOn) {
        const req = requests.find((r) => r.id === requestId);
        if (!req || req.status === 'pending') throw new Error('대기 중인 신청은 달력 탭에서 처리하세요.');
        const blocked = reviseMakeupBlockReason(requests, req, nextAction);
        if (blocked) throw new Error(blocked);
        const nextRequests = applyReviseToRequests(requests, req, nextAction);
        const nextSlots = applyReviseToSlots(openSlots, requests, req, nextAction);
        for (const item of nextRequests) {
          if (item.id === req.id || item.updatedAt !== requests.find((r) => r.id === item.id)?.updatedAt) {
            await updateDoc(doc(db!, 'makeupRequests', item.id), item);
          }
        }
        for (const slot of openSlots) {
          if (!nextSlots.some((s) => s.id === slot.id)) {
            await deleteDoc(doc(db!, 'openSlots', slot.id));
          }
        }
        for (const slot of nextSlots) {
          if (!openSlots.some((s) => s.id === slot.id)) {
            await setDoc(doc(db!, 'openSlots', slot.id), slot);
          }
        }
        const wasAccepted = req.status === 'accepted';
        const willAccept = nextAction === 'accept';
        if (wasAccepted !== willAccept) {
          await api.setMakeup(
            req.studentId,
            req.sessionId,
            willAccept ? { date: req.date, time: req.time, status: 'planned' } : null
          );
        }
        notifyRemotePush(
          makeupStudentPush(
            req,
            nextAction === 'accept' ? '보강 수락' : nextAction === 'decline' ? '보강 거절' : '보강 철회',
            nextAction === 'accept'
              ? '보강 일정이 수락으로 변경되었습니다.'
              : nextAction === 'decline'
                ? '보강 일정이 거절로 변경되었습니다.'
                : '보강 일정이 철회되었습니다.'
          )
        );
        return;
      }
      if (hubBase.current) {
        try {
          const { view } = await hubAuth(hubBase.current, {
            action: 'revise-makeup',
            uid: user?.uid,
            requestId,
            revise: nextAction,
          });
          applyShared(view, user?.uid ?? null);
          await cacheHubView(view, user?.uid || '');
          await pushCloudSnapshot();
          const revised = (view.requests || []).find((r) => r.id === requestId);
          if (revised) {
            notifyRemotePush(
              makeupStudentPush(
                revised,
                nextAction === 'accept' ? '보강 수락' : nextAction === 'decline' ? '보강 거절' : '보강 철회',
                nextAction === 'accept'
                  ? '보강 일정이 수락으로 변경되었습니다.'
                  : nextAction === 'decline'
                    ? '보강 일정이 거절로 변경되었습니다.'
                    : '보강 일정이 철회되었습니다.'
              )
            );
          }
          return;
        } catch (err) {
          const reachable = await probeHub(hubBase.current);
          if (reachable) throw err;
          hubBase.current = null;
          setSyncMode(isCloudConfigured ? 'cloud' : 'device');
        }
      }
      const shared = await currentShared();
      const req = (shared.requests || []).find((r) => r.id === requestId);
      if (!req || req.status === 'pending') throw new Error('대기 중인 신청은 달력 탭에서 처리하세요.');
      const blocked = reviseMakeupBlockReason(shared.requests, req, nextAction);
      if (blocked) throw new Error(blocked);
      await persistShared({
        requests: applyReviseToRequests(shared.requests || [], req, nextAction),
        students: applyReviseToStudents(shared.students, req, nextAction, shared.closures),
        openSlots: applyReviseToSlots(shared.openSlots || [], shared.requests || [], req, nextAction),
      });
      notifyRemotePush(
        makeupStudentPush(
          req,
          nextAction === 'accept' ? '보강 수락' : nextAction === 'decline' ? '보강 거절' : '보강 철회',
          nextAction === 'accept'
            ? '보강 일정이 수락으로 변경되었습니다.'
            : nextAction === 'decline'
              ? '보강 일정이 거절로 변경되었습니다.'
              : '보강 일정이 철회되었습니다.'
        )
      );
    },
    async removeMakeupHistory(requestId) {
      requireInstructor();
      const clean = String(requestId || '').trim();
      if (!clean) return;
      if (firebaseOn) {
        const req = requests.find((r) => r.id === clean);
        if (!req || req.status === 'pending') throw new Error('대기 중인 신청은 달력 탭에서 처리하세요.');
        const next = applyRemoveHistoryMakeup(requests, openSlots, students, req, closures);
        for (const slot of openSlots) {
          if (!next.openSlots.some((s) => s.id === slot.id)) {
            await deleteDoc(doc(db!, 'openSlots', slot.id));
          }
        }
        for (const slot of next.openSlots) {
          if (!openSlots.some((s) => s.id === slot.id)) {
            await setDoc(doc(db!, 'openSlots', slot.id), slot);
          }
        }
        if (req.status === 'accepted') {
          await api.setMakeup(req.studentId, req.sessionId, null);
        }
        await deleteDoc(doc(db!, 'makeupRequests', req.id));
        setRequests(next.requests);
        setOpenSlots(next.openSlots);
        setStudents(next.students.map((s) => normalizeStudent(s)));
        return;
      }
      const current = requestsRef.current.find((r) => r.id === clean);
      if (current?.status === 'pending') throw new Error('대기 중인 신청은 달력 탭에서 처리하세요.');
      const removedRequests = mergeRemovedRequests(removedRequestsRef.current, [clean]);
      rememberRemovedRequests(removedRequests);
      setRequests(dropRemovedRequests(requestsRef.current, removedRequests));
      if (hubBase.current) {
        try {
          const { view } = await hubAuth(hubBase.current, {
            action: 'remove-makeup-history',
            uid: user?.uid,
            requestId: clean,
          });
          applyShared(view, user?.uid ?? null);
          await cacheHubView(view, user?.uid || '');
          const local = await currentShared();
          await saveDevice({
            ...local,
            requests: dropRemovedRequests(local.requests, removedRequests),
            removedRequests,
          });
          await pushCloudSnapshot();
          return;
        } catch (err) {
          const reachable = await probeHub(hubBase.current);
          if (reachable) throw err;
          hubBase.current = null;
          setSyncMode(isCloudConfigured ? 'cloud' : 'device');
        }
      }
      const shared = await currentShared();
      const req = (shared.requests || []).find((r) => r.id === clean);
      if (!req || req.status === 'pending') throw new Error('대기 중인 신청은 달력 탭에서 처리하세요.');
      const next = applyRemoveHistoryMakeup(shared.requests || [], shared.openSlots || [], shared.students, req, shared.closures);
      await persistShared({
        requests: next.requests,
        openSlots: next.openSlots,
        students: next.students,
        removedRequests,
      });
    },
    async acknowledgeMakeup(requestIds) {
      requireInstructor();
      const ids = requestIds?.length
        ? requestIds
        : requests.filter((r) => r.decidedBy === 'instructor' && r.status !== 'pending' && !r.acknowledgedAt).map((r) => r.id);
      if (!ids.length) return;
      const want = new Set(ids);
      if (firebaseOn) {
        for (const req of requests) {
          if (!want.has(req.id) || req.acknowledgedAt) continue;
          await updateDoc(doc(db!, 'makeupRequests', req.id), applyInstructorAck(req));
        }
        return;
      }
      if (hubBase.current) {
        try {
          const { view } = await hubAuth(hubBase.current, {
            action: 'acknowledge-makeup',
            uid: user?.uid,
            requestIds: ids,
          });
          applyShared(view, user?.uid ?? null);
          await cacheHubView(view, user?.uid || '');
          await pushCloudSnapshot();
          return;
        } catch {
          hubBase.current = null;
          setSyncMode(isCloudConfigured ? 'cloud' : 'device');
        }
      }
      const shared = await currentShared();
      await persistShared({
        requests: (shared.requests || []).map((r) => (want.has(r.id) ? applyInstructorAck(r) : r)),
      });
    },
    async setPackPayment(studentId, pack, paid, paidAt, paidSessionId) {
      requireInstructor();
      const list = await currentStudents();
      const st = list.find((s) => s.id === studentId);
      if (!st) return;
      const payments = upsertPayment(st.payments, pack, paid, paidAt, paidSessionId);
      await api.patchStudent(studentId, {
        payments,
        paid: paymentBadge({ sessions: st.sessions, payments }) !== 'unpaid',
      });
    },
    async saveBank(next) {
      await api.saveBanks([next, ...banks.slice(1)]);
    },
    async saveBanks(list) {
      requireInstructor();
      const packed = packBanks(undefined, list);
      if (firebaseOn) {
        await setDoc(doc(db!, 'studio', 'bank'), { ...packed.bank, banks: packed.banks });
        applyPacked(packed.bank, packed.banks);
        return;
      }
      await persistShared({ bank: packed.bank, banks: packed.banks });
    },
    async saveInstructorName(name) {
      requireInstructor();
      if (!user) return;
      const next = name.trim();
      if (!next) throw new Error('이름을 넣어 주세요.');
      if (firebaseOn) {
        await updateDoc(doc(db!, 'users', user.uid), { name: next });
        setUser({ ...user, name: next });
        await rememberLogin({ role: 'instructor', name: next });
        return;
      }
      const shared = await currentShared();
      await persistShared({
        accounts: shared.accounts.map((a) =>
          a.uid === user.uid || a.role === 'instructor' ? { ...a, name: next } : a
        ),
      });
      await rememberLogin({ role: 'instructor', name: next });
    },
    async registerWebPush() {
      if (!user) throw new Error('로그인한 뒤 알림을 켜 주세요.');
      return enableWebPush({
        hubBase: hubBase.current,
        uid: user.uid,
        role: user.role,
        studentId: user.studentId,
        persistSubscription: async (record) => {
          await persistShared({ pushSubscriptions: [record] });
        },
      });
    },
    async sendWebPushTest() {
      if (!user) throw new Error('로그인한 뒤 테스트 알림을 보낼 수 있습니다.');
      await showWebPushTest({
        hubBase: hubBase.current,
        uid: user.uid,
        role: user.role,
        studentId: user.studentId,
      });
    },
  };

  return <StoreContext.Provider value={api}>{children}</StoreContext.Provider>;
}

function toUser(acc: Account): AppUser {
  return {
    uid: acc.uid,
    name: acc.name,
    role: acc.role,
    studentId: acc.studentId,
  };
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('Store missing');
  return ctx;
}
