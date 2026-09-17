import { useEffect, useState } from 'react';
import { Platform, Text, View } from 'react-native';
import { colors } from './theme';
import { Button, Card, Fold, Pill } from './ui';
import {
  currentWebPushPermission,
  enableWebPush,
  showWebPushTest,
  type WebPushResult,
} from './webPush';

export function WebPushSettings() {
  const [state, setState] = useState<WebPushResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [testSent, setTestSent] = useState(false);

  useEffect(() => {
    if (Platform.OS === 'web') setState(currentWebPushPermission());
  }, []);

  if (Platform.OS !== 'web' || !state) return null;

  const status =
    state.permission === 'granted'
      ? state.fcmReady
        ? { label: 'FCM 연결됨', tone: 'pine' as const }
        : { label: '알림 허용됨', tone: 'clay' as const }
      : state.permission === 'denied'
        ? { label: '알림 차단됨', tone: 'wine' as const }
        : state.permission === 'unsupported'
          ? { label: '지원 안 됨', tone: 'wine' as const }
          : { label: '알림 꺼짐', tone: 'clay' as const };

  async function enable() {
    if (busy) return;
    setBusy(true);
    setTestSent(false);
    try {
      setState(await enableWebPush());
    } catch (error) {
      setState((previous) => ({
        permission: previous?.permission || 'default',
        fcmReady: false,
        token: '',
        message:
          error instanceof Error
            ? `알림을 연결하지 못했습니다: ${error.message}`
            : '알림을 연결하지 못했습니다.',
      }));
    } finally {
      setBusy(false);
    }
  }

  async function test() {
    if (busy) return;
    setBusy(true);
    try {
      await showWebPushTest();
      setTestSent(true);
    } catch (error) {
      setState((previous) => ({
        ...(previous || currentWebPushPermission()),
        message: error instanceof Error ? error.message : '테스트 알림을 보내지 못했습니다.',
      }));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <Fold title="푸시 알림" defaultOpen>
        <View style={{ alignItems: 'flex-start', marginBottom: 10 }}>
          <Pill label={status.label} tone={status.tone} />
        </View>
        <Text style={{ color: colors.muted, lineHeight: 22, marginBottom: 12 }}>
          {testSent ? '테스트 알림을 보냈습니다. 기기의 알림 화면을 확인해 주세요.' : state.message}
        </Text>
        {state.permission !== 'unsupported' && state.permission !== 'denied' ? (
          <Button
            label={busy ? '처리 중' : state.permission === 'granted' ? '알림 다시 연결' : '알림 켜기'}
            disabled={busy}
            onPress={enable}
          />
        ) : null}
        {state.permission === 'granted' ? (
          <View style={{ marginTop: 8 }}>
            <Button
              tone="ghost"
              label={busy ? '처리 중' : '테스트 알림 보내기'}
              disabled={busy}
              onPress={test}
            />
          </View>
        ) : null}
      </Fold>
    </Card>
  );
}
