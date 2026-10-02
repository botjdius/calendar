import './env.mjs';
import { createServer, request as httpRequest } from 'node:http';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startPublicTunnel } from './tunnel.mjs';
import {
  pushReady,
  removeSubscription,
  sendPushTo,
  upsertSubscription,
  vapidPublicKey,
} from './webPush.mjs';
import { mergeBanks, packBanks } from './bank.mjs';
import { mergePushSubscriptions } from './pushStore.mjs';
import { announcementsForStudent, dropStudentsMissingFrom, fetchCloud, findStudentByJoinCode, joinCodeBlocked, liveStudents, mergeAnnouncements, mergeById, mergeFeedback, mergeOpenSlots, mergeRemovedFeedback, dropRemovedFeedback, mergeRemovedOpenSlots, dropRemovedOpenSlots, mergeRemovedRequests, dropRemovedRequests, mergeRemovedStudents, mergeRequests, mergeStudents, pushCloud, sanitizeFeedback, studentSessionRevoked } from './cloud.mjs';
import { applyRemoveStudent } from './studentRoster.mjs';
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
  reviseMakeupBlockReason,
} from './makeup.mjs';
import {
  applyAllHolidays,
  applyAttendance,
  applyLessonSetup,
  isPublicClosure,
  makeupRequestBlockReason,
  nid as makeId,
  openSlotWhenLabel,
  closureWhenLabel,
  paymentBadge,
  retargetFollowing,
  studentsAffectedByClosure,
  studentsEligibleForOpenSlot,
  upsertPayment,
  wrapCycle,
} from './lib.mjs';

const PORT = Number(process.env.JYANG_HUB_PORT || 8787);
const EXPO_PORT = Number(process.env.JYANG_EXPO_PORT || 8081);
const INSTRUCTOR_CODE = 'JYANG-TEACHER';
const file = join(dirname(fileURLToPath(import.meta.url)), 'data.json');
const filesDir = join(dirname(fileURLToPath(import.meta.url)), 'files');

const empty = () => ({
  version: 1,
  accounts: [],
  students: [],
  closures: [],
  openSlots: [],
  requests: [],
  announcements: [],
  feedback: [],
  removedFeedback: [],
  removedRequests: [],
  removedOpenSlots: [],
  bank: { bankName: '', accountNumber: '', accountHolder: '' },
  banks: [],
  removedStudents: [],
  pushSubscriptions: [],
});

function load() {
  if (!existsSync(file)) return empty();
  try {
    return { ...empty(), ...JSON.parse(readFileSync(file, 'utf8')) };
  } catch {
    return empty();
  }
}

function save(push = true) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(state, null, 2));
  if (push) void pushCloud({ ...state, hubPublicUrl: cloudPublicUrl() });
}

function nid() {
  return makeId();
}

function normName(name) {
  return String(name || '')
    .trim()
    .replace(/\s+/g, '')
    .toLowerCase();
}

let state = load();
let publicBase = String(process.env.JYANG_PUBLIC_URL || '').replace(/\/$/, '');
const SITE_PUBLIC = 'https://jyangjyang.surge.sh';

function cloudPublicUrl() {
  if (publicBase && !/trycloudflare\.com/i.test(publicBase)) return publicBase;
  return SITE_PUBLIC;
}

function isLanHost(host) {
  const name = String(host || '').split(':')[0];
  return (
    !name ||
    name === 'localhost' ||
    name === '127.0.0.1' ||
    name === '::1' ||
    /^192\.168\./.test(name) ||
    /^10\./.test(name) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(name)
  );
}

function serveMobile(res) {
  const html = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'mobile.html'), 'utf8');
  res.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store, no-cache, must-revalidate',
    Pragma: 'no-cache',
  });
  res.end(html);
}

function bump() {
  state.version = (state.version || 0) + 1;
  save();
}

function saveSubscriptions() {
  save(true);
}

function studentUid(studentId) {
  const card = (state.students || []).find((item) => item.id === studentId);
  if (card?.linkedUid) return card.linkedUid;
  return (state.accounts || []).find((item) => item.studentId === studentId)?.uid || '';
}

async function dispatchPush(matcher, payload) {
  const result = await sendPushTo(state.pushSubscriptions, matcher, payload);
  if (result.gone.length) {
    state.pushSubscriptions = (state.pushSubscriptions || []).filter(
      (item) => !result.gone.includes(item.endpoint)
    );
    saveSubscriptions();
  }
  return result;
}

function notifyInstructors(payload) {
  void dispatchPush((item) => item.role === 'instructor', payload);
}

function notifyStudent(studentId, payload) {
  const uid = studentUid(studentId);
  if (!uid) return;
  void dispatchPush((item) => item.uid === uid, payload);
}

function notifyOpenSlotStudents(slot) {
  const eligible = studentsEligibleForOpenSlot(state.students, slot.date);
  if (!eligible.length) return;
  const ids = new Set(eligible.map((student) => student.id));
  const uids = new Set(eligible.map((student) => student.linkedUid || studentUid(student.id)).filter(Boolean));
  const when = openSlotWhenLabel(slot);
  void dispatchPush(
    (item) => (item.studentId && ids.has(item.studentId)) || (item.uid && uids.has(item.uid)),
    {
      title: '새 보강 시간',
      body: when ? `${when}에 보강 신청할 수 있습니다.` : '보강 신청할 수 있는 빈 시간이 등록됐습니다.',
      url: '/board',
      tag: `open-slot-${slot.id}`,
    }
  );
}

function notifyClosureStudents(closure, roster) {
  const eligible = studentsAffectedByClosure(roster, closure);
  if (!eligible.length) return;
  const ids = new Set(eligible.map((student) => student.id));
  const uids = new Set(eligible.map((student) => student.linkedUid || studentUid(student.id)).filter(Boolean));
  const when = closureWhenLabel(closure);
  void dispatchPush(
    (item) => (item.studentId && ids.has(item.studentId)) || (item.uid && uids.has(item.uid)),
    {
      title: '휴강 안내',
      body: when ? `${when} 레슨·보강이 휴강입니다.` : '등록된 휴강이 있습니다.',
      url: '/',
      tag: `closure-${closure.id}`,
    }
  );
}

function makeupPushBody(req) {
  const when = [req.date, req.time].filter(Boolean).join(' ');
  return `${req.studentName || '레슨생'}${when ? ` · ${when}` : ''}`;
}

function mergeHubAccounts(local, cloud) {
  const next = [...(local || [])];
  for (const account of cloud || []) {
    if (account.role === 'instructor') continue;
    if (next.some((item) => item.uid === account.uid || (item.studentId && item.studentId === account.studentId))) {
      continue;
    }
    next.push(account);
  }
  return next;
}

let skipCloudPush = true;

async function pullCloudIntoHub() {
  const prevPending = new Set(
    (state.requests || [])
      .filter((item) => item.status === 'pending')
      .map((item) => `${item.id}:${item.updatedAt || item.createdAt || ''}`)
  );
  const prevFeedback = new Set((state.feedback || []).map((item) => item.id));
  const cloud = await fetchCloud();
  if (!cloud) return;
  const incomingNewer = (cloud.version || 0) > (state.version || 0);
  const removedStudents = mergeRemovedStudents(state.removedStudents, cloud.removedStudents);
  let students = liveStudents(mergeStudents(state.students, cloud.students, incomingNewer), removedStudents);
  if (incomingNewer) students = dropStudentsMissingFrom(students, cloud.students);
  const closures = mergeById(state.closures, cloud.closures, incomingNewer);
  const removedOpenSlots = mergeRemovedOpenSlots(state.removedOpenSlots, cloud.removedOpenSlots);
  const openSlots = dropRemovedOpenSlots(
    mergeOpenSlots(state.openSlots, cloud.openSlots, incomingNewer),
    removedOpenSlots
  );
  const requests = dropRemovedRequests(
    mergeRequests(state.requests, cloud.requests),
    mergeRemovedRequests(state.removedRequests, cloud.removedRequests)
  );
  const announcements = mergeAnnouncements(state.announcements, cloud.announcements || [], incomingNewer);
  const removedFeedback = mergeRemovedFeedback(state.removedFeedback, cloud.removedFeedback);
  const removedRequests = mergeRemovedRequests(state.removedRequests, cloud.removedRequests);
  const feedback = dropRemovedFeedback(mergeFeedback(state.feedback, cloud.feedback), removedFeedback);
  const accounts = mergeHubAccounts(state.accounts, cloud.accounts);
  const pushSubscriptions = mergePushSubscriptions(state.pushSubscriptions, cloud.pushSubscriptions);
  const before = JSON.stringify({
    students: state.students,
    closures: state.closures,
    openSlots: state.openSlots,
    requests: state.requests || [],
    announcements: state.announcements || [],
    feedback: state.feedback || [],
    accounts: state.accounts,
    removedStudents: state.removedStudents || [],
    removedFeedback: state.removedFeedback || [],
    removedRequests: state.removedRequests || [],
    removedOpenSlots: state.removedOpenSlots || [],
    pushSubscriptions: state.pushSubscriptions || [],
  });
  const after = JSON.stringify({
    students,
    closures,
    openSlots,
    requests,
    announcements,
    feedback,
    accounts,
    removedStudents,
    removedFeedback,
    removedRequests,
    removedOpenSlots,
    pushSubscriptions,
  });
  if (before === after) {
    skipCloudPush = false;
    return;
  }
  const requestsChanged = JSON.stringify(state.requests || []) !== JSON.stringify(requests);
  const feedbackChanged = JSON.stringify(state.feedback || []) !== JSON.stringify(feedback);
  state.students = students;
  state.closures = closures;
  state.openSlots = openSlots;
  state.requests = requests;
  state.announcements = announcements;
  state.feedback = feedback;
  state.accounts = accounts;
  state.removedStudents = removedStudents;
  state.removedFeedback = removedFeedback;
  state.removedRequests = removedRequests;
  state.removedOpenSlots = removedOpenSlots;
  state.pushSubscriptions = pushSubscriptions;
  if (incomingNewer) {
    const packed = mergeBanks(cloud, state);
    state.bank = packed.bank;
    state.banks = packed.banks;
  }
  state.version = Math.max(state.version || 0, cloud.version || 0) + ((requestsChanged || feedbackChanged) && !incomingNewer ? 1 : 0);
  save(false);
  if (skipCloudPush) {
    skipCloudPush = false;
    return;
  }
  for (const item of state.requests || []) {
    if (item.status !== 'pending') continue;
    if (prevPending.has(`${item.id}:${item.updatedAt || item.createdAt || ''}`)) continue;
    notifyInstructors({
      title: item.intent === 'withdraw' ? '보강 철회' : item.intent === 'change' ? '보강 변경' : '보강 신청',
      body: makeupPushBody(item),
      url: `/student/${item.studentId}`,
      tag: `makeup-${item.id}`,
    });
  }
  if ((state.feedback || []).some((item) => !prevFeedback.has(item.id))) {
    notifyInstructors({
      title: '새 피드백',
      body: '레슨생 피드백이 도착했습니다.',
      url: '/',
      tag: 'feedback-new',
    });
  }
}

function account(uid) {
  return state.accounts.find((a) => a.uid === uid) || null;
}

function isInstructor(uid) {
  return account(uid)?.role === 'instructor';
}

function emptyStudentView() {
  return {
    version: state.version,
    accounts: [],
    students: [],
    closures: [],
    openSlots: [],
    requests: [],
    announcements: [],
    feedback: [],
    bank: { bankName: '', accountNumber: '', accountHolder: '' },
    banks: [],
    removedStudents: state.removedStudents || [],
    removedOpenSlots: state.removedOpenSlots || [],
  };
}

function publicView() {
  return emptyStudentView();
}

function viewFor(uid) {
  const acc = account(uid);
  if (!acc) return emptyStudentView();
  if (acc.role === 'instructor') {
    return {
      version: state.version,
      accounts: state.accounts.map((a) => ({ ...a, password: a.role === 'instructor' ? a.password : '' })),
      students: state.students,
      closures: state.closures,
      openSlots: dropRemovedOpenSlots(state.openSlots, state.removedOpenSlots),
      requests: dropRemovedRequests(state.requests, state.removedRequests),
      announcements: state.announcements || [],
      feedback: dropRemovedFeedback(state.feedback, state.removedFeedback),
      removedFeedback: state.removedFeedback || [],
      removedRequests: state.removedRequests || [],
      removedOpenSlots: state.removedOpenSlots || [],
      bank: state.bank,
      banks: state.banks || [],
      removedStudents: state.removedStudents || [],
    };
  }
  if (studentSessionRevoked(uid, state.accounts, state.students, state.removedStudents)) {
    return {
      version: state.version,
      accounts: [{ ...acc, password: '' }],
      students: [],
      closures: [],
      openSlots: [],
      requests: [],
      announcements: [],
      feedback: [],
      bank: { bankName: '', accountNumber: '', accountHolder: '' },
      banks: [],
      removedStudents: (state.removedStudents || []).filter(
        (item) => item.id === acc.studentId || item.linkedUid === uid
      ),
    };
  }
  const mine = state.students.filter((s) => s.linkedUid === uid || s.id === acc.studentId);
  const myIds = new Set(mine.map((s) => s.id));
  if (acc.studentId) myIds.add(acc.studentId);
  const claimed = claimedSlotIds(state.requests);
  return {
    version: state.version,
    accounts: [{ ...acc, password: '' }],
    students: mine,
    closures: state.closures.filter(isPublicClosure),
    openSlots: dropRemovedOpenSlots(state.openSlots || [], state.removedOpenSlots).filter(
      (slot) => !claimed.has(slot.id)
    ),
    requests: (state.requests || []).filter((r) => myIds.has(r.studentId)),
    announcements: announcementsForStudent(state.announcements, acc.studentId || mine[0]?.id),
    feedback: [],
    bank: state.bank,
    banks: state.banks || [],
    removedStudents: [],
    removedOpenSlots: state.removedOpenSlots || [],
  };
}

function send(res, status, body) {
  const json = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, PUT, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Session-Uid',
    'Cache-Control': 'no-store',
  });
  res.end(json);
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8') || '{}';
  return JSON.parse(raw);
}

function lanIps() {
  const ips = [];
  for (const list of Object.values(networkInterfaces())) {
    for (const n of list || []) {
      if (n.family === 'IPv4' && !n.internal) ips.push(n.address);
    }
  }
  return ips;
}

function isHubRoute(method, pathname) {
  if (pathname === '/health' || pathname === '/view' || pathname === '/blob') return true;
  if (pathname === '/push-vapid' || pathname === '/push-subscribe' || pathname === '/push-unsubscribe' || pathname === '/push-test') {
    return true;
  }
  if (pathname === '/auth' && method === 'POST') return true;
  if (pathname === '/files' || pathname.startsWith('/files/')) return true;
  if (pathname === '/lib.js' || pathname === '/lib.mjs' || pathname === '/sw.js') return true;
  if (pathname === '/m') return true;
  return false;
}

function sendApp(req, res, url) {
  if (isLanHost(req.headers.host)) {
    const hostname = String(req.headers.host || 'localhost').split(':')[0] || 'localhost';
    res.writeHead(302, {
      Location: `http://${hostname}:${EXPO_PORT}${url.pathname}${url.search}`,
      'Cache-Control': 'no-store',
    });
    res.end();
    return;
  }
  proxyExpo(req, res);
}

function proxyExpo(req, res) {
  const headers = { ...req.headers, host: `127.0.0.1:${EXPO_PORT}` };
  const up = httpRequest(
    {
      hostname: '127.0.0.1',
      port: EXPO_PORT,
      path: req.url,
      method: req.method,
      headers,
    },
    (incoming) => {
      res.writeHead(incoming.statusCode || 502, incoming.headers);
      incoming.pipe(res);
    }
  );
  up.on('error', () => {
    if (res.headersSent) {
      res.end();
      return;
    }
    const site = 'https://jyangjyang.surge.sh';
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
    });
    res.end(`<!doctype html>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>쟝쟝</title>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Apple SD Gothic Neo',sans-serif;background:#F3EDE3;color:#1F1A16;padding:28px;line-height:1.6">
  <h1 style="margin:0 0 12px">쟝쟝</h1>
  <p>이 주소는 지금 맥 앱이 꺼져 있어서 열리지 않습니다. 아래 공개 주소로 들어가 주세요.</p>
  <p><a href="${site}/teach">강사 로그인</a> · <a href="${site}/enter">레슨생 로그인</a></p>
</body>`);
  });
  req.pipe(up);
}

function sessionUid(req, url) {
  return (
    url.searchParams.get('uid') ||
    req.headers['x-session-uid'] ||
    ''
  ).toString();
}

const server = createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    send(res, 204, {});
    return;
  }
  const url = new URL(req.url || '/', `http://127.0.0.1:${PORT}`);
  try {
    if (req.method === 'GET' && url.pathname === '/health') {
      const ips = lanIps();
      const publicUrls = [...new Set([publicBase, 'https://jyangjyang.surge.sh'].filter(Boolean))];
      send(res, 200, {
        ok: true,
        version: state.version,
        lan: ips,
        phone: ['http://localhost:8081', ...ips.map((ip) => `http://${ip}:${EXPO_PORT}`)],
        hub: ips.map((ip) => `http://${ip}:${PORT}`),
        public: publicUrls,
        expo: `http://localhost:${EXPO_PORT}`,
        push: pushReady(),
      });
      return;
    }
    if (req.method === 'GET' && url.pathname === '/push-vapid') {
      send(res, 200, { publicKey: vapidPublicKey(), ready: pushReady() });
      return;
    }
    if (req.method === 'POST' && url.pathname === '/push-subscribe') {
      const body = await readBody(req);
      const acc = account(body.uid);
      if (!acc) {
        send(res, 403, { error: '로그인한 뒤 알림을 켜 주세요.' });
        return;
      }
      state.pushSubscriptions = upsertSubscription(
        state.pushSubscriptions,
        acc.uid,
        acc.role,
        body.subscription,
        acc.studentId
      );
      if (!state.pushSubscriptions.some((item) => item.endpoint === body.subscription?.endpoint)) {
        send(res, 400, { error: '이 브라우저의 푸시 구독을 저장하지 못했습니다.' });
        return;
      }
      saveSubscriptions();
      send(res, 200, { ok: true, push: true });
      return;
    }
    if (req.method === 'POST' && url.pathname === '/push-unsubscribe') {
      const body = await readBody(req);
      const endpoint = body.subscription?.endpoint || body.endpoint;
      state.pushSubscriptions = removeSubscription(state.pushSubscriptions, {
        uid: body.uid,
        endpoint,
      });
      saveSubscriptions();
      send(res, 200, { ok: true });
      return;
    }
    if (req.method === 'POST' && url.pathname === '/push-test') {
      const body = await readBody(req);
      const acc = account(body.uid);
      if (!acc) {
        send(res, 403, { error: '로그인한 뒤 테스트 알림을 보낼 수 있습니다.' });
        return;
      }
      const result = await dispatchPush((item) => item.uid === acc.uid, {
        title: '쟝쟝 알림 테스트',
        body: '앱을 닫아도 이 알림이 오면 백그라운드 푸시가 연결된 것입니다.',
        url: acc.role === 'instructor' ? '/teach' : '/',
        tag: 'jyang-jyang-test',
      });
      if (!result.sent) {
        send(res, 400, { error: '이 기기의 푸시 구독이 없습니다. 알림 켜기를 다시 눌러 주세요.' });
        return;
      }
      send(res, 200, { ok: true, sent: result.sent });
      return;
    }
    if (req.method === 'GET' && url.pathname === '/m') {
      serveMobile(res);
      return;
    }
    if (req.method === 'GET' && url.pathname === '/sw.js') {
      const js = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'sw.js'), 'utf8');
      res.writeHead(200, {
        'Content-Type': 'text/javascript; charset=utf-8',
        'Cache-Control': 'no-store',
        'Service-Worker-Allowed': '/',
      });
      res.end(js);
      return;
    }
    if (req.method === 'GET' && (url.pathname === '/lib.js' || url.pathname === '/lib.mjs')) {
      const js = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'lib.mjs'), 'utf8');
      res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(js);
      return;
    }
    if (req.method === 'POST' && url.pathname === '/files') {
      const body = await readBody(req);
      mkdirSync(filesDir, { recursive: true });
      const id = String(body.id || nid());
      const ext = extname(String(body.name || '')) || '';
      const filename = `${id}${ext}`;
      const data = String(body.data || '');
      if (!data) {
        send(res, 400, { error: '파일 데이터가 없습니다.' });
        return;
      }
      writeFileSync(join(filesDir, filename), Buffer.from(data, 'base64'));
      const host = req.headers.host || `127.0.0.1:${PORT}`;
      send(res, 200, {
        id,
        name: body.name,
        mime: body.mime || 'application/octet-stream',
        uri: `http://${host}/files/${filename}`,
      });
      return;
    }
    if (req.method === 'GET' && url.pathname.startsWith('/files/')) {
      const filename = decodeURIComponent(url.pathname.slice('/files/'.length));
      const path = join(filesDir, filename);
      if (!filename || filename.includes('..') || !existsSync(path)) {
        send(res, 404, { error: '파일을 찾을 수 없습니다.' });
        return;
      }
      const buf = readFileSync(path);
      res.writeHead(200, {
        'Content-Type': 'application/octet-stream',
        'Access-Control-Allow-Origin': '*',
        'Content-Disposition': `inline; filename="${filename}"`,
      });
      res.end(buf);
      return;
    }
    if (req.method === 'GET' && (url.pathname === '/blob' || url.pathname === '/view')) {
      send(res, 200, viewFor(sessionUid(req, url)));
      return;
    }
    if (req.method === 'PUT' && (url.pathname === '/blob' || url.pathname === '/view')) {
      const uid = sessionUid(req, url);
      if (!isInstructor(uid)) {
        send(res, 403, { error: '강사만 전체 자료를 저장할 수 있습니다.' });
        return;
      }
      const incoming = await readBody(req);
      if (incoming.students !== undefined) state.students = incoming.students;
      if (incoming.closures !== undefined) state.closures = incoming.closures;
      if (incoming.openSlots !== undefined) state.openSlots = incoming.openSlots;
      if (incoming.requests !== undefined) state.requests = mergeRequests(state.requests, incoming.requests);
      if (incoming.announcements !== undefined) {
        state.announcements = mergeAnnouncements(state.announcements, incoming.announcements, true);
      }
      if (incoming.feedback !== undefined) state.feedback = mergeFeedback(state.feedback, incoming.feedback);
      if (incoming.removedFeedback !== undefined) {
        state.removedFeedback = mergeRemovedFeedback(state.removedFeedback, incoming.removedFeedback);
      }
      if (incoming.removedRequests !== undefined) {
        state.removedRequests = mergeRemovedRequests(state.removedRequests, incoming.removedRequests);
      }
      if (incoming.removedOpenSlots !== undefined) {
        state.removedOpenSlots = mergeRemovedOpenSlots(state.removedOpenSlots, incoming.removedOpenSlots);
      }
      state.feedback = dropRemovedFeedback(state.feedback, state.removedFeedback);
      state.requests = dropRemovedRequests(state.requests, state.removedRequests);
      state.openSlots = dropRemovedOpenSlots(state.openSlots, state.removedOpenSlots);
      if (incoming.bank !== undefined || incoming.banks !== undefined) {
        const packed = packBanks(incoming.bank, incoming.banks !== undefined ? incoming.banks : state.banks);
        state.bank = packed.bank;
        state.banks = packed.banks;
      }
      if (incoming.accounts) {
        const passwords = new Map(state.accounts.map((a) => [a.uid, a.password]));
        state.accounts = incoming.accounts.map((a) => ({
          ...a,
          password: a.password || passwords.get(a.uid) || '',
        }));
      }
      if (incoming.removedStudents !== undefined) {
        state.removedStudents = mergeRemovedStudents(state.removedStudents, incoming.removedStudents);
      }
      if (incoming.pushSubscriptions !== undefined) {
        state.pushSubscriptions = mergePushSubscriptions(state.pushSubscriptions, incoming.pushSubscriptions);
      }
      if (incoming.students !== undefined) {
        const liveIds = new Set((state.students || []).map((s) => s.id));
        state.requests = (state.requests || []).filter((r) => liveIds.has(r.studentId));
        if (incoming.accounts) {
          state.accounts = state.accounts.filter(
            (account) => account.role !== 'student' || !account.studentId || liveIds.has(account.studentId)
          );
        }
      }
      bump();
      send(res, 200, viewFor(uid));
      return;
    }
    if (req.method === 'POST' && url.pathname === '/auth') {
      const body = await readBody(req);
      const action = body.action;
      if (action === 'instructor-signup') {
        if (String(body.code || '').trim() !== INSTRUCTOR_CODE) {
          send(res, 400, { error: '강사 코드가 올바르지 않습니다.' });
          return;
        }
        if (String(body.password || '').trim().length < 4) {
          send(res, 400, { error: '비밀번호는 4자 이상으로 해 주세요.' });
          return;
        }
        if (state.accounts.some((a) => a.role === 'instructor')) {
          const existing = state.accounts.find((a) => a.role === 'instructor');
          const name = String(body.name || '').trim() || existing.name;
          const password = String(body.password || '').trim();
          state.accounts = state.accounts.map((a) =>
            a.role === 'instructor' ? { ...a, name, password } : a
          );
          bump();
          send(res, 200, { uid: existing.uid, view: viewFor(existing.uid) });
          return;
        }
        const acc = {
          uid: nid(),
          name: String(body.name || '').trim(),
          password: String(body.password || ''),
          role: 'instructor',
        };
        state.accounts = [...state.accounts, acc];
        bump();
        send(res, 200, { uid: acc.uid, view: viewFor(acc.uid) });
        return;
      }
      if (action === 'instructor-login') {
        const acc = state.accounts.find(
          (a) =>
            a.role === 'instructor' &&
            normName(a.name) === normName(body.name) &&
            String(a.password || '').trim() === String(body.password || '').trim()
        );
        if (!acc) {
          send(res, 400, { error: '이름 또는 비밀번호가 올바르지 않습니다.' });
          return;
        }
        send(res, 200, { uid: acc.uid, view: viewFor(acc.uid) });
        return;
      }
      if (action === 'student-join') {
        const joinCode = String(body.code || '')
          .trim()
          .toUpperCase();
        await pullCloudIntoHub();
        const card = findStudentByJoinCode(liveStudents(state.students, state.removedStudents), joinCode);
        if (!card && joinCodeBlocked(joinCode, state.students, state.removedStudents)) {
          send(res, 400, { error: '이전에 삭제한 레슨생의 가입코드입니다. 새로 만든 카드의 코드를 입력하세요.' });
          return;
        }
        if (!card) {
          send(res, 400, { error: '가입코드가 올바르지 않습니다. 강사에게 받은 코드를 확인하세요.' });
          return;
        }
        if (String(body.name || '').trim() && normName(card.name) !== normName(body.name)) {
          send(res, 400, { error: '이름이 레슨생 카드와 같지 않습니다.' });
          return;
        }
        let acc = state.accounts.find((a) => a.role === 'student' && a.studentId === card.id);
        if (!acc) {
          acc = {
            uid: nid(),
            name: card.name,
            password: joinCode,
            role: 'student',
            studentId: card.id,
          };
          state.accounts = [...state.accounts, acc];
        }
        state.students = state.students.map((s) =>
          s.id === card.id ? { ...s, linkedUid: acc.uid } : s
        );
        bump();
        send(res, 200, { uid: acc.uid, view: viewFor(acc.uid) });
        return;
      }
      if (action === 'student-absent') {
        const acc = account(body.uid);
        if (!acc || acc.role !== 'student') {
          send(res, 403, { error: '레슨생만 불참석을 표시할 수 있습니다.' });
          return;
        }
        const card = state.students.find((s) => s.linkedUid === acc.uid || s.id === acc.studentId);
        if (!card) {
          send(res, 400, { error: '연결된 레슨 카드가 없습니다.' });
          return;
        }
        const absent = String(body.absent || '') === '1';
        state.students = state.students.map((s) => {
          if (s.id !== card.id) return s;
          return {
            ...s,
            sessions: (s.sessions || []).map((sess) => {
              if (sess.id !== body.sessionId) return sess;
              if (sess.status === 'cancelled') return sess;
              return { ...sess, status: absent ? 'absent' : 'pending' };
            }),
          };
        });
        bump();
        send(res, 200, { uid: acc.uid, view: viewFor(acc.uid) });
        return;
      }
      if (action === 'student-note') {
        const acc = account(body.uid);
        if (!acc || acc.role !== 'student') {
          send(res, 403, { error: '레슨생만 내 메모를 쓸 수 있습니다.' });
          return;
        }
        const card = state.students.find((s) => s.linkedUid === acc.uid || s.id === acc.studentId);
        if (!card) {
          send(res, 400, { error: '연결된 레슨 카드가 없습니다.' });
          return;
        }
        state.students = state.students.map((s) => {
          if (s.id !== card.id) return s;
          return {
            ...s,
            sessions: (s.sessions || []).map((sess) =>
              sess.id === body.sessionId ? { ...sess, studentNote: String(body.note || '') } : sess
            ),
          };
        });
        bump();
        send(res, 200, { uid: acc.uid, view: viewFor(acc.uid) });
        return;
      }
      if (action === 'add-closure') {
        if (!isInstructor(body.uid)) {
          send(res, 403, { error: '강사만 휴강을 등록할 수 있습니다.' });
          return;
        }
        const start = body.endDate && body.endDate < body.date ? body.endDate : body.date;
        const end = body.endDate && body.endDate < body.date ? body.date : body.endDate || body.date;
        if (!start) {
          send(res, 400, { error: '휴강 날짜를 넣으세요.' });
          return;
        }
        const item = {
          id: nid(),
          date: start,
          endDate: end,
          time: String(body.time || '').trim(),
          reason: String(body.reason || '').trim(),
          scope: 'all',
        };
        const roster = state.students;
        state.closures = [item, ...state.closures];
        state.students = applyAllHolidays(state.students, state.closures);
        bump();
        notifyClosureStudents(item, roster);
        send(res, 200, { uid: body.uid, view: viewFor(body.uid) });
        return;
      }
      if (action === 'add-open-slot') {
        if (!isInstructor(body.uid)) {
          send(res, 403, { error: '강사만 빈 시간을 등록할 수 있습니다.' });
          return;
        }
        if (!body.date || !String(body.startTime || '').trim()) {
          send(res, 400, { error: '날짜와 시작 시간을 넣으세요.' });
          return;
        }
        const slot = {
          id: nid(),
          date: String(body.date),
          startTime: String(body.startTime || '').trim(),
          endTime: String(body.endTime || '').trim(),
          note: String(body.note || '').trim(),
        };
        state.openSlots = [slot, ...(state.openSlots || [])];
        bump();
        notifyOpenSlotStudents(slot);
        send(res, 200, { uid: body.uid, view: viewFor(body.uid) });
        return;
      }
      if (action === 'remove-open-slot') {
        if (!isInstructor(body.uid)) {
          send(res, 403, { error: '강사만 빈 시간을 지울 수 있습니다.' });
          return;
        }
        state.removedOpenSlots = mergeRemovedOpenSlots(state.removedOpenSlots, [body.id]);
        state.openSlots = dropRemovedOpenSlots(state.openSlots || [], state.removedOpenSlots);
        bump();
        send(res, 200, { uid: body.uid, view: viewFor(body.uid) });
        return;
      }
      if (action === 'save-bank') {
        if (!isInstructor(body.uid)) {
          send(res, 403, { error: '강사만 계좌를 저장할 수 있습니다.' });
          return;
        }
        const packed = Array.isArray(body.banks)
          ? packBanks(body.bank, body.banks)
          : packBanks(
              {
                id: (state.banks || [])[0]?.id || state.bank?.id,
                bankName: String(body.bankName || '').trim(),
                accountNumber: String(body.accountNumber || '').trim(),
                accountHolder: String(body.accountHolder || '').trim(),
              },
              undefined
            );
        if (!Array.isArray(body.banks) && (state.banks || []).length > 1) {
          const next = packBanks(undefined, [packed.bank, ...state.banks.slice(1)]);
          state.bank = next.bank;
          state.banks = next.banks;
        } else {
          state.bank = packed.bank;
          state.banks = packed.banks;
        }
        bump();
        send(res, 200, { uid: body.uid, view: viewFor(body.uid) });
        return;
      }
      if (action === 'save-instructor-name') {
        if (!isInstructor(body.uid)) {
          send(res, 403, { error: '강사만 이름을 바꿀 수 있습니다.' });
          return;
        }
        const name = String(body.name || '').trim();
        if (!name) {
          send(res, 400, { error: '이름을 넣어 주세요.' });
          return;
        }
        state.accounts = (state.accounts || []).map((a) =>
          a.uid === body.uid || a.role === 'instructor' ? { ...a, name } : a
        );
        bump();
        send(res, 200, { uid: body.uid, view: viewFor(body.uid) });
        return;
      }
      if (action === 'remove-closure') {
        if (!isInstructor(body.uid)) {
          send(res, 403, { error: '강사만 휴강을 지울 수 있습니다.' });
          return;
        }
        state.closures = state.closures.filter((c) => c.id !== body.id);
        bump();
        send(res, 200, { uid: body.uid, view: viewFor(body.uid) });
        return;
      }
      if (action === 'apply-first-date') {
        if (!isInstructor(body.uid)) {
          send(res, 403, { error: '강사만 일정을 바꿀 수 있습니다.' });
          return;
        }
        const firstDate = String(body.firstDate || '');
        if (!firstDate) {
          send(res, 400, { error: '첫 레슨 날짜를 넣으세요.' });
          return;
        }
        state.students = state.students.map((s) => {
          if (s.id !== body.studentId) return s;
          const weekday = Number.isInteger(Number(body.weekday)) ? Number(body.weekday) : s.weekday;
          return applyLessonSetup(
            s,
            {
              weekday,
              time: body.time || s.time,
              startCycle: wrapCycle(body.startCycle || s.startCycle || 1),
              firstDate,
            },
            state.closures
          );
        });
        bump();
        send(res, 200, { uid: body.uid, view: viewFor(body.uid) });
        return;
      }
      if (action === 'remove-student') {
        if (!isInstructor(body.uid)) {
          send(res, 403, { error: '강사만 레슨생을 지울 수 있습니다.' });
          return;
        }
        const studentId = String(body.studentId || '');
        if (!studentId) {
          send(res, 400, { error: '레슨생을 선택하세요.' });
          return;
        }
        const next = applyRemoveStudent(state, studentId);
        state.removedStudents = next.removedStudents;
        state.students = next.students;
        state.accounts = next.accounts;
        state.requests = next.requests;
        state.closures = next.closures;
        bump();
        send(res, 200, { uid: body.uid, view: viewFor(body.uid) });
        return;
      }
      if (action === 'set-session-date') {
        if (!isInstructor(body.uid)) {
          send(res, 403, { error: '강사만 일정을 바꿀 수 있습니다.' });
          return;
        }
        state.students = state.students.map((s) => {
          if (s.id !== body.studentId) return s;
          return { ...s, sessions: retargetFollowing(s.sessions || [], body.sessionId, body.date, body.time) };
        });
        bump();
        send(res, 200, { uid: body.uid, view: viewFor(body.uid) });
        return;
      }
      if (action === 'set-pack-payment') {
        if (!isInstructor(body.uid)) {
          send(res, 403, { error: '강사만 결제를 표시할 수 있습니다.' });
          return;
        }
        const paid = String(body.paid || '') === '1' || body.paid === true;
        state.students = state.students.map((s) => {
          if (s.id !== body.studentId) return s;
          const payments = upsertPayment(s.payments, Number(body.pack), paid, body.paidAt, body.paidSessionId);
          return {
            ...s,
            payments,
            paid: paymentBadge({ sessions: s.sessions, payments }) !== 'unpaid',
          };
        });
        bump();
        send(res, 200, { uid: body.uid, view: viewFor(body.uid) });
        return;
      }
      if (action === 'set-session-status') {
        if (!isInstructor(body.uid)) {
          send(res, 403, { error: '강사만 출석을 바꿀 수 있습니다.' });
          return;
        }
        state.students = state.students.map((s) => {
          if (s.id !== body.studentId) return s;
          return {
            ...s,
            sessions: (s.sessions || []).map((sess) =>
              sess.id === body.sessionId ? applyAttendance(sess, body.status) : sess
            ),
          };
        });
        bump();
        send(res, 200, { uid: body.uid, view: viewFor(body.uid) });
        return;
      }
      if (action === 'send-feedback') {
        const acc = account(body.uid);
        if (!acc || acc.role !== 'student') {
          send(res, 403, { error: '레슨생만 피드백을 보낼 수 있습니다.' });
          return;
        }
        const card = liveStudents(state.students, state.removedStudents).find(
          (s) => s.linkedUid === acc.uid || s.id === acc.studentId
        );
        if (!card) {
          send(res, 400, { error: '연결된 레슨 카드가 없습니다.' });
          return;
        }
        const item = sanitizeFeedback({
          id: nid(),
          body: body.body,
          createdAt: new Date().toISOString(),
        });
        if (!item) {
          send(res, 400, { error: '내용을 적어 주세요.' });
          return;
        }
        state.feedback = mergeFeedback(state.feedback, [item]);
        state.feedback = dropRemovedFeedback(state.feedback, state.removedFeedback);
        bump();
        notifyInstructors({
          title: '새 피드백',
          body: '레슨생 피드백이 도착했습니다.',
          url: '/',
          tag: `feedback-${item.id}`,
        });
        send(res, 200, { uid: acc.uid, view: viewFor(acc.uid) });
        if (!isInstructor(body.uid)) {
          send(res, 403, { error: '강사만 피드백을 지울 수 있습니다.' });
          return;
        }
        const id = String(body.id || '').trim();
        if (!id) {
          send(res, 400, { error: '지울 글을 찾지 못했습니다.' });
          return;
        }
        state.removedFeedback = mergeRemovedFeedback(state.removedFeedback, [id]);
        state.feedback = dropRemovedFeedback(state.feedback, state.removedFeedback);
        bump();
        send(res, 200, { uid: body.uid, view: viewFor(body.uid) });
        return;
      }
      if (action === 'remove-makeup-history') {
        if (!isInstructor(body.uid)) {
          send(res, 403, { error: '강사만 보강 내역을 지울 수 있습니다.' });
          return;
        }
        const requestId = String(body.requestId || '').trim();
        const req = (state.requests || []).find((r) => r.id === requestId);
        if (!req || req.status === 'pending') {
          send(res, 400, { error: '지울 보강 내역을 찾지 못했습니다.' });
          return;
        }
        const next = applyRemoveHistoryMakeup(state.requests || [], state.openSlots || [], state.students, req, state.closures);
        state.removedRequests = mergeRemovedRequests(state.removedRequests, [req.id]);
        state.requests = dropRemovedRequests(next.requests, state.removedRequests);
        state.openSlots = next.openSlots;
        state.students = next.students;
        bump();
        send(res, 200, { uid: body.uid, view: viewFor(body.uid) });
        return;
      }
      if (action === 'request-makeup') {
        const acc = account(body.uid);
        if (!acc || acc.role !== 'student') {
          send(res, 403, { error: '레슨생만 보강을 신청할 수 있습니다.' });
          return;
        }
        const card = state.students.find((s) => s.linkedUid === acc.uid || s.id === acc.studentId);
        if (!card) {
          send(res, 400, { error: '연결된 레슨 카드가 없습니다.' });
          return;
        }
        const slot = (state.openSlots || []).find((s) => s.id === body.slotId);
        const session = (card.sessions || []).find((s) => s.id === body.sessionId);
        if (!slot) {
          send(res, 400, { error: '보강 가능 시간을 찾을 수 없습니다.' });
          return;
        }
        if (!session) {
          send(res, 400, { error: '바꿀 레슨 회차를 찾을 수 없습니다.' });
          return;
        }
        if (session.status === 'cancelled') {
          send(res, 400, { error: '휴강 회차는 보강으로 바꿀 수 없습니다.' });
          return;
        }
        if (session.status === 'attended') {
          send(res, 400, { error: '이미 출석한 회차는 보강으로 바꿀 수 없습니다.' });
          return;
        }
        const blocked = makeupRequestBlockReason(session, slot.date);
        if (blocked) {
          send(res, 400, { error: blocked });
          return;
        }
        const open = findReusableMakeup(state.requests, card.id, session.id);
        if (open) {
          try {
            state.requests = (state.requests || []).map((r) =>
              r.id === open.id ? applyStudentChange(r, slot, session) : r
            );
            bump();
            notifyInstructors({
              title: '보강 변경',
              body: makeupPushBody({ ...open, date: slot.date, time: slot.startTime, studentName: card.name }),
              url: `/student/${card.id}`,
              tag: `makeup-${open.id}`,
            });
            send(res, 200, { uid: acc.uid, view: viewFor(acc.uid) });
          } catch (err) {
            send(res, 400, { error: String(err.message || err) });
          }
          return;
        }
        const createdAt = new Date().toISOString();
        const item = {
          id: nid(),
          studentId: card.id,
          studentName: card.name,
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
        state.requests = [item, ...(state.requests || [])];
        bump();
        notifyInstructors({
          title: '보강 신청',
          body: makeupPushBody(item),
          url: `/student/${item.studentId}`,
          tag: `makeup-${item.id}`,
        });
        send(res, 200, { uid: acc.uid, view: viewFor(acc.uid) });
        return;
      }
      if (action === 'change-makeup' || action === 'withdraw-makeup') {
        const acc = account(body.uid);
        if (!acc || acc.role !== 'student') {
          send(res, 403, { error: '레슨생만 보강 신청을 바꿀 수 있습니다.' });
          return;
        }
        const card = state.students.find((s) => s.linkedUid === acc.uid || s.id === acc.studentId);
        const req = (state.requests || []).find((r) => r.id === String(body.requestId || ''));
        if (!card || !req || req.studentId !== card.id) {
          send(res, 400, { error: '바꿀 신청이 없습니다.' });
          return;
        }
        try {
          if (action === 'withdraw-makeup') {
            state.requests = (state.requests || []).map((r) => (r.id === req.id ? applyStudentWithdraw(r) : r));
          } else {
            const slot = (state.openSlots || []).find((s) => s.id === body.slotId);
            const session = (card.sessions || []).find((s) => s.id === body.sessionId);
            if (!slot || !session) {
              send(res, 400, { error: '바꿀 레슨 또는 시간을 찾을 수 없습니다.' });
              return;
            }
            const blocked = makeupRequestBlockReason(session, slot.date);
            if (blocked) {
              send(res, 400, { error: blocked });
              return;
            }
            state.requests = (state.requests || []).map((r) => (r.id === req.id ? applyStudentChange(r, slot, session) : r));
          }
          bump();
          notifyInstructors({
            title: action === 'withdraw-makeup' ? '보강 철회' : '보강 변경',
            body: makeupPushBody(req),
            url: `/student/${req.studentId}`,
            tag: `makeup-${req.id}`,
          });
          send(res, 200, { uid: acc.uid, view: viewFor(acc.uid) });
        } catch (err) {
          send(res, 400, { error: String(err.message || err) });
        }
        return;
      }
      if (action === 'decide-makeup') {
        if (!isInstructor(body.uid)) {
          send(res, 403, { error: '강사만 보강 신청을 처리할 수 있습니다.' });
          return;
        }
        const requestId = String(body.requestId || '');
        const req = (state.requests || []).find((r) => r.id === requestId);
        if (!req || req.status !== 'pending') {
          send(res, 400, { error: '처리할 보강 신청이 없습니다.' });
          return;
        }
        const accepted = body.accepted === true || String(body.accepted || '') === '1';
        const nextRequests = applyDecideToRequests(state.requests || [], req, accepted);
        state.requests = nextRequests;
        state.openSlots = applyDecideToSlots(state.openSlots || [], req, accepted, nextRequests);
        state.students = applyDecideToStudents(state.students, req, accepted, state.closures);
        bump();
        notifyStudent(req.studentId, {
          title: accepted ? '보강 수락' : '보강 거절',
          body: accepted
            ? '신청한 보강이 수락되었습니다.'
            : '신청한 보강이 거절되었습니다.',
          url: '/',
          tag: `makeup-${req.id}`,
        });
        send(res, 200, { uid: body.uid, view: viewFor(body.uid) });
        return;
      }
      if (action === 'revise-makeup') {
        if (!isInstructor(body.uid)) {
          send(res, 403, { error: '강사만 보강 내역을 수정할 수 있습니다.' });
          return;
        }
        const requestId = String(body.requestId || '');
        const revise = String(body.revise || '');
        const req = (state.requests || []).find((r) => r.id === requestId);
        if (!req || req.status === 'pending') {
          send(res, 400, { error: '대기 중인 신청은 달력 탭에서 처리하세요.' });
          return;
        }
        if (revise !== 'accept' && revise !== 'decline' && revise !== 'withdraw') {
          send(res, 400, { error: '수정할 수 없는 요청입니다.' });
          return;
        }
        const blocked = reviseMakeupBlockReason(state.requests, req, revise);
        if (blocked) {
          send(res, 400, { error: blocked });
          return;
        }
        try {
          const requests = state.requests || [];
          state.requests = applyReviseToRequests(requests, req, revise);
          state.openSlots = applyReviseToSlots(state.openSlots || [], requests, req, revise);
          state.students = applyReviseToStudents(state.students, req, revise, state.closures);
          bump();
          notifyStudent(req.studentId, {
            title: revise === 'accept' ? '보강 수락' : revise === 'decline' ? '보강 거절' : '보강 철회',
            body:
              revise === 'accept'
                ? '보강 일정이 수락으로 변경되었습니다.'
                : revise === 'decline'
                  ? '보강 일정이 거절로 변경되었습니다.'
                  : '보강 일정이 철회되었습니다.',
            url: '/',
            tag: `makeup-${req.id}`,
          });
          send(res, 200, { uid: body.uid, view: viewFor(body.uid) });
        } catch (err) {
          send(res, 400, { error: String(err.message || err) });
        }
        return;
      }
      if (action === 'acknowledge-makeup') {
        if (!isInstructor(body.uid)) {
          send(res, 403, { error: '강사만 보강 알림을 확인할 수 있습니다.' });
          return;
        }
        const ids = Array.isArray(body.requestIds)
          ? body.requestIds.map((id) => String(id || '')).filter(Boolean)
          : body.requestId
            ? [String(body.requestId)]
            : [];
        if (!ids.length) {
          send(res, 400, { error: '확인할 알림이 없습니다.' });
          return;
        }
        const want = new Set(ids);
        state.requests = (state.requests || []).map((r) => (want.has(r.id) ? applyInstructorAck(r) : r));
        bump();
        send(res, 200, { uid: body.uid, view: viewFor(body.uid) });
        return;
      }
      if (action === 'leave') {
        const acc = account(body.uid);
        if (!acc) {
          send(res, 200, { uid: null, view: publicView() });
          return;
        }
        if (acc.role === 'student') {
          state.students = state.students.map((s) =>
            s.linkedUid === acc.uid || s.id === acc.studentId ? { ...s, linkedUid: null } : s
          );
        }
        state.accounts = state.accounts.filter((a) => a.uid !== acc.uid);
        state.pushSubscriptions = removeSubscription(state.pushSubscriptions, { uid: acc.uid });
        bump();
        send(res, 200, { uid: null, view: publicView() });
        return;
      }
      send(res, 400, { error: '알 수 없는 요청입니다.' });
      return;
    }
    if (req.method === 'GET' || req.method === 'HEAD') {
      sendApp(req, res, url);
      return;
    }
    send(res, 404, { error: 'not found' });
  } catch (e) {
    send(res, 400, { error: String(e.message || e) });
  }
});

const beforeRepair = JSON.stringify(state.students);
state.students = applyAllHolidays(state.students, state.closures);
if (JSON.stringify(state.students) !== beforeRepair) bump();

server.listen({ port: PORT, host: '::', ipv6Only: false }, () => {
  const ips = lanIps();
  console.log(`jyang-jyang hub http://localhost:${PORT}`);
  console.log(`맥 브라우저: http://localhost:${EXPO_PORT}`);
  if (ips.length) {
    for (const ip of ips) {
      console.log(`아이폰 Safari 주소: http://${ip}:${EXPO_PORT}`);
    }
  } else {
    console.log('아이폰 주소: 같은 와이파이의 맥 IP를 확인한 뒤 http://맥IP:8081');
  }
  startPublicTunnel(PORT, (url) => {
    publicBase = url;
    console.log(`임시 터널(같은 세션만): ${url}`);
    console.log(`공개 주소: ${cloudPublicUrl()}`);
    console.log(`강사 로그인: ${cloudPublicUrl()}/teach`);
    console.log(`레슨생 바로 입장: ${cloudPublicUrl()}/j/가입코드`);
  });
});

setInterval(() => {
  void pullCloudIntoHub();
}, 4000);
void pullCloudIntoHub();
