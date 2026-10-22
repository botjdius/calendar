export const CLOUD_FILE_MAX = 100_000_000;
export const HUB_FILE_MAX = 100_000_000;
export const RENTRY_FILE_MAX = 4_000_000;

export function dataUri(mime, data) {
  return `data:${mime || 'application/octet-stream'};base64,${data}`;
}

export function base64FromDataUri(value) {
  const text = String(value || '');
  const comma = text.indexOf(',');
  if (text.startsWith('data:') && comma >= 0) return text.slice(comma + 1);
  return text;
}

export function bytesFromBase64(data) {
  return Math.ceil((String(data || '').length * 3) / 4);
}

export function assertAttachSize(bytes, hub = false) {
  const max = hub ? HUB_FILE_MAX : CLOUD_FILE_MAX;
  const labelMb = Math.round(max / 1_000_000);
  if (bytes > max) throw new Error(`파일이 너무 큽니다. ${labelMb}MB 이하로 올려 주세요.`);
}

export function bytesArrayFromBase64(data) {
  const raw = base64FromDataUri(data);
  if (typeof Buffer !== 'undefined') return new Uint8Array(Buffer.from(raw, 'base64'));
  const binary = atob(raw);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function blobFromBase64(data, mime) {
  return new Blob([bytesArrayFromBase64(data)], { type: mime || 'application/octet-stream' });
}
