import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Linking from 'expo-linking';
import { Platform } from 'react-native';
import {
  assertAttachSize,
  base64FromDataUri,
  blobFromBase64,
  bytesFromBase64,
  dataUri,
  RENTRY_FILE_MAX,
} from './fileCodec.mjs';
import { isFilePointer, resolveFileUri, uploadPublicAttachment } from './fileCloud.mjs';
import { nid } from './schedule';
import type { SessionFile } from './types';

export { assertAttachSize, base64FromDataUri, CLOUD_FILE_MAX, dataUri, HUB_FILE_MAX } from './fileCodec.mjs';

const fileCache = new Map<string, string>();

function rememberFile(id: string, uri: string) {
  if (id && uri) fileCache.set(id, uri);
}

function cachedFile(id: string) {
  return fileCache.get(id) || '';
}

export function sessionFileFromBase64(name: string, mime: string, data: string): SessionFile {
  const raw = base64FromDataUri(data);
  assertAttachSize(bytesFromBase64(raw));
  const kind = mime || 'application/octet-stream';
  const id = nid();
  const uri = dataUri(kind, raw);
  rememberFile(id, uri);
  return { id, name: name || '파일', mime: kind, uri };
}

function rememberBlob(id: string, blob: Blob, mime: string, data?: string) {
  if (typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
    rememberFile(id, URL.createObjectURL(blob));
    return;
  }
  if (data) rememberFile(id, dataUri(mime, data));
}

async function persistCloudFile(file: {
  id: string;
  name: string;
  mime: string;
  blob: Blob;
  data?: string;
}): Promise<SessionFile> {
  const kind = file.mime || 'application/octet-stream';
  rememberBlob(file.id, file.blob, kind, file.data);
  const uri = await uploadPublicAttachment(file.blob, file.name, kind);
  return { id: file.id, name: file.name || '파일', mime: kind, uri };
}

async function readBase64(uri: string) {
  if (uri.startsWith('data:')) return base64FromDataUri(uri);
  if (Platform.OS === 'web') {
    const res = await fetch(uri);
    const buf = await res.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let binary = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
    }
    return btoa(binary);
  }
  return FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
}

function readBrowserFile(file: File): Promise<{ name: string; mime: string; data: string; size: number }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('파일을 읽지 못했습니다.'));
    reader.onload = () => {
      const result = String(reader.result || '');
      resolve({
        name: file.name || '파일',
        mime: file.type || 'application/octet-stream',
        data: base64FromDataUri(result),
        size: file.size,
      });
    };
    reader.readAsDataURL(file);
  });
}

async function uploadToHub(
  hubBase: string,
  file: { id: string; name: string; mime: string; data: string }
): Promise<SessionFile> {
  if (file.data.length > 35_000_000) throw new Error('파일이 너무 큽니다. 25MB 이하로 올려 주세요.');
  const res = await fetch(`${hubBase}/files`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(file),
  });
  const body = (await res.json().catch(() => ({}))) as { error?: string; id?: string; uri?: string };
  if (!res.ok) throw new Error(body.error || '파일을 올리지 못했습니다.');
  return { id: body.id || file.id, name: file.name, uri: String(body.uri || ''), mime: file.mime };
}

export async function sessionFileFromBrowserFile(file: File, hubBase: string | null): Promise<SessionFile> {
  assertAttachSize(file.size || 0);
  const id = nid();
  const name = file.name || '파일';
  const mime = file.type || 'application/octet-stream';
  if (hubBase && file.size <= RENTRY_FILE_MAX) {
    try {
      const read = await readBrowserFile(file);
      await uploadToHub(hubBase, { id, name: read.name, mime: read.mime, data: read.data });
    } catch {
      // public cloud still reaches students on the site
    }
  }
  return persistCloudFile({ id, name, mime, blob: file });
}

function pickWebFile(): Promise<File | null> {
  if (typeof document === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = false;
    input.style.position = 'fixed';
    input.style.left = '0';
    input.style.top = '0';
    input.style.width = '1px';
    input.style.height = '1px';
    input.style.opacity = '0';
    let settled = false;
    const finish = (picked: File | null) => {
      if (settled) return;
      settled = true;
      window.removeEventListener('focus', onFocus);
      input.remove();
      resolve(picked);
    };
    const onFocus = () => {
      setTimeout(() => {
        if (!settled && !input.files?.length) finish(null);
      }, 700);
    };
    input.addEventListener('change', () => finish(input.files?.[0] || null));
    input.addEventListener('cancel', () => finish(null));
    document.body.appendChild(input);
    input.click();
    window.addEventListener('focus', onFocus);
  });
}

export async function pickAndUploadSessionFile(hubBase: string | null): Promise<SessionFile | null> {
  if (Platform.OS === 'web') {
    const picked = await pickWebFile();
    if (!picked) return null;
    return sessionFileFromBrowserFile(picked, hubBase);
  }

  const picked = await DocumentPicker.getDocumentAsync({
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (picked.canceled || !picked.assets?.[0]) return null;
  const asset = picked.assets[0];
  const name = asset.name || '파일';
  const mime = asset.mimeType || 'application/octet-stream';
  const id = nid();
  if (typeof asset.size === 'number') assertAttachSize(asset.size);
  const blob = await blobFromAsset(asset.uri, mime);
  if (typeof asset.size !== 'number') assertAttachSize(blob.size || 0);
  if (hubBase && (blob.size || 0) <= RENTRY_FILE_MAX) {
    try {
      const data = await readBase64(asset.uri);
      await uploadToHub(hubBase, { id, name, mime, data });
    } catch {
      // public cloud still reaches students on the site
    }
  }
  return persistCloudFile({ id, name, mime, blob });
}

async function blobFromAsset(uri: string, mime: string): Promise<Blob> {
  if (uri.startsWith('data:')) return blobFromBase64(uri, mime);
  const res = await fetch(uri);
  if (res.ok) return res.blob();
  return blobFromBase64(await readBase64(uri), mime);
}

function bytesFromB64(raw: string) {
  const data = base64FromDataUri(raw);
  if (typeof atob === 'function') {
    const binary = atob(data);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }
  return Uint8Array.from(Buffer.from(data, 'base64'));
}

function webHref(file: SessionFile, href: string) {
  if (!href.startsWith('data:') || typeof URL === 'undefined' || typeof Blob === 'undefined') return href;
  const mime = file.mime || href.slice(5, href.indexOf(';')) || 'application/octet-stream';
  const blob = new Blob([bytesFromB64(href)], { type: mime });
  return URL.createObjectURL(blob);
}

export async function openSessionFile(file: SessionFile) {
  const popup =
    Platform.OS === 'web' && typeof window !== 'undefined' ? window.open('', '_blank') : null;
  if (popup) {
    try {
      popup.document.write(
        '<!doctype html><title>파일</title><p style="font-family:sans-serif;padding:24px">파일을 여는 중…</p>'
      );
      popup.document.close();
    } catch {
      // keep the blank tab
    }
  }
  try {
    const remembered = file?.id ? cachedFile(file.id) : '';
    let href = remembered || String(file?.uri || '');
    if (!href) throw new Error('파일 주소가 없습니다.');
    if (isFilePointer(href)) {
      href = await resolveFileUri({ ...file, uri: href });
      if (file?.id) rememberFile(file.id, href);
    }
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      href = webHref(file, href);
      if (popup && !popup.closed) {
        popup.location.replace(href);
        return;
      }
      const link = document.createElement('a');
      link.href = href;
      link.download = file.name || '파일';
      link.target = '_blank';
      link.rel = 'noopener';
      document.body.appendChild(link);
      link.click();
      link.remove();
      return;
    }
    popup?.close();
    await Linking.openURL(href);
  } catch (err) {
    popup?.close();
    throw err;
  }
}
