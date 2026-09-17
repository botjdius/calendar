import { useState } from 'react';
import { Text, View } from 'react-native';
import { timeLabel } from './MonthCal';
import { makeupIntent, studentRequestLabel } from './makeup';
import { formatTime12, slotsForSessionMakeup } from './schedule';
import { colors } from './theme';
import type { MakeupRequest, OpenSlot, Student } from './types';
import { Button } from './ui';

export function StudentMakeupActions({
  request,
  session,
  openSlots,
  saving,
  onWithdraw,
  onChange,
}: {
  request: MakeupRequest;
  session: Student['sessions'][number];
  openSlots: OpenSlot[];
  saving?: boolean;
  onWithdraw: (requestId: string) => Promise<void>;
  onChange: (requestId: string, slotId: string, sessionId: string) => Promise<void>;
}) {
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const intent = makeupIntent(request);
  const slots = slotsForSessionMakeup(openSlots, session);
  const immediate = request.status === 'pending' && intent === 'apply';
  const waitingChange = request.status === 'pending' && (intent === 'withdraw' || intent === 'change');
  const accepted = request.status === 'accepted';

  async function run(kind: string, fn: () => Promise<void>) {
    if (busy || saving) return;
    setBusy(kind);
    setError('');
    try {
      await fn();
      setPicking(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : '처리하지 못했습니다.');
    } finally {
      setBusy('');
    }
  }

  return (
    <View style={{ marginTop: 10 }}>
      {error ? (
        <Text style={{ color: colors.wine, fontWeight: '700', marginBottom: 6 }}>{error}</Text>
      ) : null}
      <Text style={{ color: intent === 'withdraw' ? colors.wine : colors.clay, fontWeight: '700' }}>
        {studentRequestLabel(request)}{' '}
        {timeLabel(request.date)} {formatTime12(request.time)}
        {request.endTime ? `–${formatTime12(request.endTime)}` : ''}
      </Text>
      {intent === 'change' && request.previousDate ? (
        <Text style={{ color: colors.muted, fontWeight: '700', marginTop: 4 }}>
          기존 {timeLabel(request.previousDate)} {formatTime12(request.previousTime || request.time)}
          {' → '}
          {timeLabel(request.date)} {formatTime12(request.time)}
        </Text>
      ) : null}
      {picking ? (
        <View style={{ marginTop: 8 }}>
          <Text style={{ color: colors.muted, marginBottom: 6 }}>바꿀 보강 시간을 고르세요.</Text>
          {slots.length === 0 ? (
            <Text style={{ color: colors.wine, fontWeight: '700' }}>바꿀 수 있는 공개 시간이 없습니다.</Text>
          ) : (
            slots.map((slot) => (
              <Button
                key={slot.id}
                tone="clay"
                disabled={Boolean(busy)}
                label={
                  busy === slot.id
                    ? '저장 중'
                    : `${timeLabel(slot.date)} ${formatTime12(slot.startTime)}${slot.endTime ? `–${formatTime12(slot.endTime)}` : ''}으로 ${immediate ? '변경' : '변경 요청'}`
                }
                onPress={() => run(slot.id, () => onChange(request.id, slot.id, session.id))}
              />
            ))
          )}
          <Button tone="ghost" label="닫기" onPress={() => setPicking(false)} />
        </View>
      ) : (
        <View style={{ marginTop: 8 }}>
          {immediate ? (
            <>
              <Button
                tone="ghost"
                disabled={Boolean(busy)}
                label={busy === 'withdraw' ? '처리 중' : '신청 철회'}
                onPress={() => run('withdraw', () => onWithdraw(request.id))}
              />
              <Button tone="clay" disabled={Boolean(busy)} label="시간 변경" onPress={() => setPicking(true)} />
            </>
          ) : null}
          {accepted ? (
            <>
              <Button
                tone="ghost"
                disabled={Boolean(busy)}
                label={busy === 'withdraw' ? '처리 중' : '철회 요청'}
                onPress={() => run('withdraw', () => onWithdraw(request.id))}
              />
              <Button tone="clay" disabled={Boolean(busy)} label="변경 요청" onPress={() => setPicking(true)} />
            </>
          ) : null}
          {waitingChange && intent === 'withdraw' ? (
            <Button
              tone="ghost"
              disabled={Boolean(busy)}
              label={busy === 'withdraw' ? '처리 중' : '철회 요청 취소'}
              onPress={() => run('withdraw', () => onWithdraw(request.id))}
            />
          ) : null}
          {waitingChange && intent === 'change' ? (
            <>
              <Button
                tone="ghost"
                disabled={Boolean(busy)}
                label={busy === 'withdraw' ? '처리 중' : '변경 요청 취소'}
                onPress={() => run('withdraw', () => onWithdraw(request.id))}
              />
              <Button tone="clay" disabled={Boolean(busy)} label="다른 시간으로" onPress={() => setPicking(true)} />
            </>
          ) : null}
        </View>
      )}
    </View>
  );
}
