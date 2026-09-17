import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { timeLabel } from './MonthCal';
import { makeupIntent } from './makeup';
import { formatTime12 } from './schedule';
import { useStore } from './store';
import { colors } from './theme';
import type { MakeupRequest } from './types';
import { Button, Card } from './ui';

function decideLabels(req: MakeupRequest) {
  const intent = makeupIntent(req);
  if (intent === 'withdraw') return { no: '유지', yes: '철회 수락' };
  if (intent === 'change') return { no: '유지', yes: '변경 수락' };
  return { no: '거절', yes: '수락' };
}

function requestLine(req: MakeupRequest) {
  return `${req.sessionCycle}회 ${req.sessionDate ? timeLabel(req.sessionDate) : '기존 레슨'} → ${timeLabel(req.date)} ${formatTime12(req.time)}${req.endTime ? `–${formatTime12(req.endTime)}` : ''}`;
}

export function MakeupInbox() {
  const { user, requests, decideMakeup } = useStore();
  const router = useRouter();
  const [busyId, setBusyId] = useState('');
  const pending = requests.filter((r) => r.status === 'pending');

  async function decide(id: string, accepted: boolean) {
    if (busyId) return;
    setBusyId(id);
    try {
      await decideMakeup(id, accepted);
    } finally {
      setBusyId('');
    }
  }

  if (user?.role !== 'instructor' || pending.length === 0) return null;

  return (
    <SafeAreaView edges={['top']} style={{ paddingHorizontal: 16, paddingTop: 10, backgroundColor: colors.bg }}>
      {pending.map((req) => (
        <Card key={req.id} style={{ marginBottom: 8, backgroundColor: colors.claySoft }}>
          <Pressable onPress={() => router.push(`/(instructor)/student/${req.studentId}`)}>
            <Text style={{ fontWeight: '800', color: colors.clay }}>
              {req.intent === 'withdraw' ? '보강 철회 요청' : req.intent === 'change' ? '보강 변경 요청' : '보강 신청'} · {req.studentName}
            </Text>
            <Text style={{ color: colors.ink, marginTop: 4, fontWeight: '700' }}>{requestLine(req)}</Text>
            <Text style={{ color: colors.muted, marginTop: 4, fontSize: 12 }}>수락하면 해당 회차가 보강으로 대체됩니다.</Text>
          </Pressable>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
            <View style={{ flex: 1 }}>
              <Button
                tone="ghost"
                label={busyId === req.id ? '처리 중' : decideLabels(req).no}
                disabled={Boolean(busyId)}
                onPress={() => decide(req.id, false)}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Button
                label={busyId === req.id ? '처리 중' : decideLabels(req).yes}
                disabled={Boolean(busyId)}
                onPress={() => decide(req.id, true)}
              />
            </View>
          </View>
        </Card>
      ))}
    </SafeAreaView>
  );
}
