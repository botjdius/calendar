import { useEffect, useState } from 'react';
import { siteUrl } from './config';
import { fetchLanInfo, type LanInfo } from './connect';

export function joinPath(code: string) {
  return `/j/${String(code || '').trim().toUpperCase()}`;
}

export function shareBase(info: LanInfo | null, fallback = '') {
  return String(siteUrl || info?.public?.[0] || fallback).replace(/\/$/, '');
}

export function studentShareLink(code: string, info: LanInfo | null, fallback = '') {
  const base = shareBase(info, fallback);
  const clean = String(code || '').trim().toUpperCase();
  if (!base || !clean) return '';
  return `${base}${joinPath(clean)}`;
}

export function instructorShareLink(info: LanInfo | null, fallback = '') {
  const base = shareBase(info, fallback);
  return base ? `${base}/teach` : '';
}

export function useLanInfo() {
  const [info, setInfo] = useState<LanInfo | null>(null);
  useEffect(() => {
    let alive = true;
    const load = async () => {
      const next = await fetchLanInfo();
      if (alive) setInfo(next);
    };
    load();
    const timer = setInterval(load, 4000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);
  return info;
}
