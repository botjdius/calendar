import { useEffect } from 'react';
import { Platform } from 'react-native';

function safariGap() {
  const vv = window.visualViewport;
  if (!vv) return 0;
  return Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
}

export function IosSafariGap() {
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const apply = () => {
      const gap = safariGap();
      document.documentElement.style.setProperty('--safari-gap', `${gap}px`);
    };
    apply();
    window.visualViewport?.addEventListener('resize', apply);
    window.visualViewport?.addEventListener('scroll', apply);
    window.addEventListener('resize', apply);
    const timer = window.setInterval(apply, 800);
    return () => {
      window.visualViewport?.removeEventListener('resize', apply);
      window.visualViewport?.removeEventListener('scroll', apply);
      window.removeEventListener('resize', apply);
      window.clearInterval(timer);
    };
  }, []);
  return null;
}
