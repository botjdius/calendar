import Constants from 'expo-constants';
import { Platform } from 'react-native';

export type LanInfo = {
  ok?: boolean;
  lan: string[];
  phone: string[];
  hub: string[];
  public?: string[];
};

function isPrivateHost(host: string) {
  const name = String(host || '').split(':')[0];
  return (
    name === 'localhost' ||
    name === '127.0.0.1' ||
    /^192\.168\./.test(name) ||
    /^10\./.test(name) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(name)
  );
}

export function hubUrl(): string {
  const env = (process.env.EXPO_PUBLIC_HUB_URL ?? '').replace(/\/$/, '');
  if (env) return env;
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    const { hostname, origin, port } = window.location;
    if (port === '8787') return origin.replace(/\/$/, '');
    if (port !== '8081' && port !== '19006' && port !== '19000' && hostname && !isPrivateHost(hostname)) {
      return origin.replace(/\/$/, '');
    }
    if (hostname && isPrivateHost(hostname) && hostname !== 'localhost' && hostname !== '127.0.0.1') {
      return `http://${hostname}:8787`;
    }
  }
  const host =
    Constants.expoConfig?.hostUri?.split(':')[0] ||
    (Constants as { expoGoConfig?: { debuggerHost?: string } }).expoGoConfig?.debuggerHost?.split(':')[0] ||
    '';
  if (host && host !== 'localhost' && host !== '127.0.0.1') {
    return `http://${host}:8787`;
  }
  return 'http://127.0.0.1:8787';
}

export function phoneUrls(): string[] {
  const urls: string[] = [];
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    const { hostname, protocol, port } = window.location;
    if (hostname && hostname !== 'localhost' && hostname !== '127.0.0.1') {
      urls.push(`${protocol}//${hostname}${port ? `:${port}` : ''}`);
    }
  }
  const host = Constants.expoConfig?.hostUri;
  if (host) urls.push(`http://${host}`);
  return [...new Set(urls)];
}

export async function fetchLanInfo(): Promise<LanInfo | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 3000);
  try {
    const res = await fetch(`${hubUrl()}/health`, { signal: ctrl.signal });
    if (!res.ok) return null;
    const body = await res.json();
    return {
      ok: true,
      lan: body.lan || [],
      phone: body.phone || [],
      hub: body.hub || [],
      public: body.public || [],
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
