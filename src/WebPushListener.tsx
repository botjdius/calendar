import { useEffect } from 'react';
import { Platform } from 'react-native';
import { useStore } from './store';
import { syncWebPushIfAllowed } from './webPush';

export function WebPushListener() {
  const { ready, user, hubUrl } = useStore();

  useEffect(() => {
    if (Platform.OS !== 'web' || !ready || !user) return;
    void syncWebPushIfAllowed({
      hubBase: hubUrl,
      uid: user.uid,
      role: user.role,
      studentId: user.studentId,
    });
  }, [ready, user?.uid, user?.role, user?.studentId, hubUrl]);

  return null;
}
