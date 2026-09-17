import { useEffect, useState } from 'react';
import { Platform, Text, View } from 'react-native';
import { useStore } from './store';
import { colors } from './theme';
import { Button, Card, Fold, Pill } from './ui';
import { cloudPushConfigured } from './cloudPush';
import { currentWebPushPermission, type WebPushResult } from './webPush';

export function WebPushSettings() {
  const { user, registerWebPush, sendWebPushTest } = useStore();
  const [state, setState] = useState<WebPushResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [testSent, setTestSent] = useState(false);

  useEffect(() => {
    if (Platform.OS === 'web') setState(currentWebPushPermission());
  }, []);

  if (Platform.OS !== 'web' || !state || !user) return null;

  const status =
    state.permission === 'granted'
      ? state.hubSaved
        ? { label: '앱 꺼도 수신', tone: 'pine' as const }
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
      setState(await registerWebPush());
    } catch (error) {
      setState((previous) => ({
        permission: previous?.permission || 'default',
        pushReady: false,
        hubSaved: false,
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
      await sendWebPushTest();
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
          {testSent
            ? state.hubSaved || cloudPushConfigured()
              ? '서버 테스트 알림을 보냈습니다. 앱을 완전히 나간 뒤에도 왔는지 확인해 주세요.'
              : '테스트 알림을 보냈습니다. 알림 켜기를 다시 연결하면 앱을 꺼도 받을 수 있습니다.'
            : state.message}
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
