import { useEffect } from 'react';
import { Platform } from 'react-native';
import { listenForForegroundMessages } from './webPush';

export function WebPushListener() {
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    let unsubscribe: undefined | (() => void);
    let active = true;
    void listenForForegroundMessages().then((next) => {
      if (active) unsubscribe = next;
      else next();
    });
    return () => {
      active = false;
      unsubscribe?.();
    };
  }, []);

  return null;
}
