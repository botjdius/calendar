import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { timeLabel } from './MonthCal';
import { instructorRequestLabel, makeupIntent } from './makeup';
import { formatTime12 } from './schedule';
import { colors } from './theme';
import type { MakeupRequest } from './types';
import { Button, Card } from './ui';

function decideLabels(req: MakeupRequest) {
  const intent = makeupIntent(req);
  if (intent === 'withdraw') return { no: '유지', yes: '철회 수락' };
  if (intent === 'change') return { no: '유지', yes: '변경 수락' };
  return { no: '거절', yes: '수락' };
}

export function MakeupReview({
  requests,
  onDecide,
  onOpenStudent,
}: {
  requests: MakeupRequest[];
  onDecide: (requestId: string, accepted: boolean) => Promise<void>;
  onOpenStudent?: (studentId: string) => void;
}) {
  const [busyId, setBusyId] = useState('');
  const pending = requests.filter((r) => r.status === 'pending');

  async function decide(id: string, accepted: boolean) {
    if (busyId) return;
    setBusyId(id);
    try {
      await onDecide(id, accepted);
    } finally {
      setBusyId('');
    }
  }

  if (!pending.length) return null;

  return (
    <>
      <Card>
        <Text style={{ fontWeight: '800', color: colors.clay }}>확인 대기 {pending.length}건</Text>
        <Text style={{ color: colors.muted, marginTop: 6, lineHeight: 22 }}>
          강사로 열린 모든 기기에서 수락·거절할 수 있습니다. 수락하면 해당 회차가 보강으로 바뀌고 빈 시간은 레슨생에게 보이지 않습니다.
        </Text>
      </Card>
      {pending.map((req) => (
        <Card key={req.id} style={{ backgroundColor: colors.claySoft }}>
          <Pressable onPress={() => onOpenStudent?.(req.studentId)} disabled={!onOpenStudent}>
            <Text style={{ fontWeight: '800', color: colors.clay }}>
              {req.studentName} · {instructorRequestLabel(req)}
            </Text>
            <Text style={{ color: colors.ink, marginTop: 6, fontWeight: '700', lineHeight: 22 }}>
              {req.sessionCycle}회 {req.sessionDate ? timeLabel(req.sessionDate) : '기존 레슨'} → {timeLabel(req.date)}{' '}
              {formatTime12(req.time)}
              {req.endTime ? `–${formatTime12(req.endTime)}` : ''}
            </Text>
            {makeupIntent(req) === 'change' && req.previousDate ? (
              <Text style={{ color: colors.muted, marginTop: 4, fontWeight: '700' }}>
                기존 {timeLabel(req.previousDate)} {formatTime12(req.previousTime || req.time)}에서 변경 요청
              </Text>
            ) : null}
          </Pressable>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
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
    </>
  );
}
