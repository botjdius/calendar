import { base64FromDataUri, blobFromBase64, dataUri, RENTRY_FILE_MAX } from './fileCodec.mjs';

export const FILE_POINTER_PREFIX = 'rentryfile:';
export const FILE_EDIT_CODE = 'jyangcloud';
export const FILE_INDEX_ID = 'jyangjyang-files';
export const RENTRY_TEXT_SAFE = 180_000;
export const FILE_SLOTS = Array.from({ length: 40 }, (_, i) => `jyangjf${String(i).padStart(2, '0')}`);

const RENTRY_FETCH = 'https://rentry.co/api/fetch';
const RENTRY_EDIT = 'https://rentry.co/api/edit';
const INDEX_MAX = 185_000;

export function isDataUri(uri) {
  return String(uri || '').startsWith('data:');
}

export function isFilePointer(uri) {
  return String(uri || '').startsWith(FILE_POINTER_PREFIX);
}

export function chunkText(text, size = RENTRY_TEXT_SAFE) {
  const value = String(text || '');
  if (!value) return [];
  const parts = [];
  for (let i = 0; i < value.length; i += size) parts.push(value.slice(i, i + size));
  return parts;
}

export function pointerFromIds(ids) {
  return FILE_POINTER_PREFIX + (ids || []).filter(Boolean).join(',');
}

export function idsFromPointer(uri) {
  const raw = String(uri || '');
  if (!raw.startsWith(FILE_POINTER_PREFIX)) return [];
  return raw
    .slice(FILE_POINTER_PREFIX.length)
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
}

function rentryText(data) {
  if (!data || typeof data !== 'object') return '';
  if (typeof data.content === 'string') return data.content;
  if (data.content && typeof data.content === 'object' && typeof data.content.text === 'string') {
    return data.content.text;
  }
  return '';
}

async function timed(url, init, ms = 30000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchRentryPaste(id) {
  const res = await timed(`${RENTRY_FETCH}/${encodeURIComponent(id)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `edit_code=${encodeURIComponent(FILE_EDIT_CODE)}`,
  });
  if (!res.ok) return '';
  const data = await res.json().catch(() => ({}));
  if (String(data.status || '') !== '200') return '';
  return rentryText(data);
}

async function editRentryPaste(id, text) {
  const res = await timed(
    `${RENTRY_EDIT}/${encodeURIComponent(id)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `edit_code=${encodeURIComponent(FILE_EDIT_CODE)}&text=${encodeURIComponent(text)}`,
    },
    45000
  );
  if (!res.ok) return false;
  const data = await res.json().catch(() => ({}));
  return String(data.status || '') === '200';
}

function emptyIndex() {
  return { files: {}, used: {} };
}

async function loadIndex() {
  const text = await fetchRentryPaste(FILE_INDEX_ID);
  if (!text) return emptyIndex();
  try {
    const parsed = JSON.parse(text);
    return {
      files: parsed.files && typeof parsed.files === 'object' ? parsed.files : {},
      used: parsed.used && typeof parsed.used === 'object' ? parsed.used : {},
    };
  } catch {
    return emptyIndex();
  }
}

async function saveIndex(index) {
  return editRentryPaste(FILE_INDEX_ID, JSON.stringify(index));
}

function newFileId() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

async function blobToBase64(blob) {
  if (!blob) return '';
  if (typeof FileReader !== 'undefined') {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('파일을 읽지 못했습니다.'));
      reader.onload = () => resolve(base64FromDataUri(String(reader.result || '')));
      reader.readAsDataURL(blob);
    });
  }
  const buffer = Buffer.from(await blob.arrayBuffer());
  return buffer.toString('base64');
}

export async function uploadToGofile(blob, name, mime) {
  if (!blob) throw new Error('파일 데이터가 없습니다.');
  const form = new FormData();
  const filename = name || 'file';
  try {
    form.append('file', blob, filename);
  } catch {
    const typed =
      typeof File !== 'undefined'
        ? new File([blob], filename, { type: mime || blob.type || 'application/octet-stream' })
        : blob;
    form.append('file', typed);
  }
  const res = await timed(
    'https://upload.gofile.io/uploadfile',
    { method: 'POST', body: form },
    120000
  );
  if (!res.ok) throw new Error('파일을 클라우드에 올리지 못했습니다.');
  const data = await res.json().catch(() => ({}));
  const page = data?.data?.downloadPage || data?.data?.directLink;
  if (data?.status !== 'ok' || !page) throw new Error('파일을 클라우드에 올리지 못했습니다.');
  return String(page);
}

export async function uploadPublicAttachment(blob, name, mime) {
  const size = Number(blob?.size || 0);
  if (size && size <= RENTRY_FILE_MAX) {
    try {
      return await uploadBase64ToRentry(await blobToBase64(blob));
    } catch (err) {
      if (size <= 80_000) throw err;
    }
  }
  return uploadToGofile(blob, name, mime);
}

export async function uploadBase64ToRentry(data) {
  const raw = base64FromDataUri(data);
  if (!raw) throw new Error('파일 데이터가 없습니다.');
  const index = await loadIndex();
  const fileId = newFileId();
  const inline = { ...index, files: { ...index.files, [fileId]: { data: raw } } };
  if (JSON.stringify(inline).length <= INDEX_MAX) {
    if (!(await saveIndex(inline))) throw new Error('파일을 클라우드에 올리지 못했습니다.');
    return pointerFromIds([`${FILE_INDEX_ID}#${fileId}`]);
  }

  const chunks = chunkText(raw);
  const used = { ...index.used };
  const free = FILE_SLOTS.filter((slot) => !used[slot]);
  const parts = [];
  for (let i = 0; i < chunks.length; i += 1) {
    const slot = free[i];
    if (!slot) throw new Error('클라우드 파일 공간이 부족합니다. 쓰지 않는 첨부를 지운 뒤 다시 올려 주세요.');
    if (!(await editRentryPaste(slot, chunks[i]))) {
      throw new Error('파일을 클라우드에 올리지 못했습니다.');
    }
    used[slot] = fileId;
    parts.push(slot);
  }
  index.files[fileId] = { parts };
  index.used = used;
  if (!(await saveIndex(index))) throw new Error('파일을 클라우드에 올리지 못했습니다.');
  return pointerFromIds(parts);
}

export async function downloadPointer(uri) {
  const ids = idsFromPointer(uri);
  if (!ids.length) throw new Error('파일 주소가 없습니다.');
  if (ids.length === 1 && ids[0].includes('#')) {
    const [page, fileId] = ids[0].split('#');
    const text = await fetchRentryPaste(page || FILE_INDEX_ID);
    if (!text) throw new Error('첨부 파일을 불러오지 못했습니다.');
    const index = JSON.parse(text);
    const data = index?.files?.[fileId]?.data;
    if (!data) throw new Error('첨부 파일을 불러오지 못했습니다.');
    return data;
  }
  const chunks = await Promise.all(ids.map((id) => fetchRentryPaste(id)));
  if (chunks.some((text) => !text)) throw new Error('첨부 파일을 불러오지 못했습니다.');
  return chunks.join('');
}

export async function releaseFilePointer(uri) {
  if (!isFilePointer(uri)) return;
  const ids = idsFromPointer(uri);
  if (!ids.length) return;
  const index = await loadIndex();
  if (ids.length === 1 && ids[0].includes('#')) {
    const fileId = ids[0].split('#')[1];
    if (fileId && index.files[fileId]) delete index.files[fileId];
    await saveIndex(index);
    return;
  }
  const fileId = Object.keys(index.files).find((id) => {
    const parts = index.files[id]?.parts || [];
    return parts.length && parts.every((part, i) => part === ids[i]);
  });
  for (const slot of ids) {
    if (index.used?.[slot]) delete index.used[slot];
  }
  if (fileId) delete index.files[fileId];
  await saveIndex(index);
}

export async function resolveFileUri(file) {
  const uri = String(file?.uri || '');
  if (isDataUri(uri)) return uri;
  if (isFilePointer(uri)) {
    const mime = file?.mime || 'application/octet-stream';
    return dataUri(mime, await downloadPointer(uri));
  }
  return uri;
}

export function mergeRemovedAttachmentIds(...lists) {
  const ids = new Set();
  for (const list of lists) {
    for (const id of list || []) {
      const clean = String(id || '').trim();
      if (clean) ids.add(clean);
    }
  }
  return [...ids];
}

export function droppedAttachmentIds(newer, other) {
  const keep = new Set((Array.isArray(newer) ? newer : []).map((item) => item?.id).filter(Boolean));
  return (Array.isArray(other) ? other : []).map((item) => item?.id).filter((id) => id && !keep.has(id));
}

export function mergeSessionAttachments(newer, other, removedIds) {
  const fallback = Array.isArray(other) ? other : [];
  const list = Array.isArray(newer) ? newer : fallback;
  const prev = new Map(fallback.filter((item) => item?.id).map((item) => [item.id, item]));
  const removed = new Set(removedIds || []);
  return list
    .filter((item) => item && item.id && item.uri && !removed.has(item.id))
    .map((item) => {
      const older = prev.get(item.id);
      if (older && isDataUri(older.uri) && !isDataUri(item.uri)) return { ...item, uri: older.uri };
      return item;
    });
}

export function stripDataUriAttachments(students) {
  return (students || []).map((student) => ({
    ...student,
    sessions: (student.sessions || []).map((session) => ({
      ...session,
      attachments: (session.attachments || []).filter((file) => file && file.id && file.uri && !isDataUri(file.uri)),
    })),
  }));
}

export async function externalizeStudents(students) {
  const next = [];
  for (const student of students || []) {
    const sessions = [];
    for (const session of student.sessions || []) {
      const attachments = [];
      for (const file of session.attachments || []) {
        if (file?.uri && isDataUri(file.uri)) {
          try {
            const blob = blobFromBase64(file.uri, file.mime);
            attachments.push({
              ...file,
              uri: await uploadPublicAttachment(blob, file.name, file.mime),
            });
          } catch {
            attachments.push(file);
          }
        } else {
          attachments.push(file);
        }
      }
      sessions.push({ ...session, attachments });
    }
    next.push({ ...student, sessions });
  }
  return next;
}
