import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { timeLabel } from './MonthCal';
import { historyMakeupRequests, instructorRequestLabel } from './makeup';
import { formatTime12 } from './schedule';
import { colors } from './theme';
import type { MakeupRequest } from './types';
import { Button, Card, ConfirmBox } from './ui';

function requestLine(req: MakeupRequest) {
  return `${req.sessionCycle}회 ${req.sessionDate ? timeLabel(req.sessionDate) : '기존 레슨'} → ${timeLabel(req.date)} ${formatTime12(req.time)}${req.endTime ? `–${formatTime12(req.endTime)}` : ''}`;
}

export function MakeupHistory({
  requests,
  onRevise,
  onRemove,
  onOpenStudent,
}: {
  requests: MakeupRequest[];
  onRevise: (requestId: string, action: 'accept' | 'decline' | 'withdraw') => Promise<void>;
  onRemove?: (requestId: string) => Promise<void>;
  onOpenStudent?: (studentId: string) => void;
}) {
  const [busyId, setBusyId] = useState('');
  const [askId, setAskId] = useState('');
  const [message, setMessage] = useState('');
  const history = historyMakeupRequests(requests);

  async function revise(id: string, action: 'accept' | 'decline' | 'withdraw') {
    if (busyId) return;
    setBusyId(id);
    setMessage('');
    try {
      await onRevise(id, action);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : '수정하지 못했습니다.');
    } finally {
      setBusyId('');
    }
  }

  async function remove(id: string) {
    if (busyId || !onRemove) return;
    setBusyId(id);
    setMessage('');
    try {
      await onRemove(id);
      setAskId('');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : '지우지 못했습니다.');
    } finally {
      setBusyId('');
    }
  }

  if (!history.length) {
    return (
      <Card>
        <Text style={{ color: colors.muted, lineHeight: 22 }}>
          수락하거나 거절한 보강이 아직 없습니다. 달력 탭의 실시간 신청에서 처리한 내역이 여기 모입니다.
        </Text>
      </Card>
    );
  }

  return (
    <>
      {message ? (
        <Card style={{ backgroundColor: colors.wineSoft }}>
          <Text style={{ color: colors.wine, fontWeight: '700' }}>{message}</Text>
        </Card>
      ) : null}
      {history.map((req) => (
        <Card
          key={req.id}
          style={{
            backgroundColor:
              req.status === 'accepted' ? colors.mossSoft : req.status === 'declined' ? colors.wineSoft : colors.paper,
          }}
        >
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
            <Pressable onPress={() => onOpenStudent?.(req.studentId)} disabled={!onOpenStudent} style={{ flex: 1 }}>
              <Text style={{ fontWeight: '800', color: colors.ink }}>
                {req.studentName} · {instructorRequestLabel(req)}
              </Text>
              <Text style={{ color: colors.ink, fontWeight: '700', lineHeight: 22, marginTop: 6 }}>{requestLine(req)}</Text>
            </Pressable>
            {onRemove ? (
              <Pressable
                onPress={() => {
                  if (busyId) return;
                  setMessage('');
                  setAskId(askId === req.id ? '' : req.id);
                }}
              >
                <Text style={{ color: colors.wine, fontWeight: '800' }}>삭제</Text>
              </Pressable>
            ) : null}
          </View>
          {askId === req.id && onRemove ? (
            <ConfirmBox
              title="보강 내역 삭제"
              message={
                req.status === 'accepted'
                  ? '이 보강 내역을 지울까요? 수락된 보강이면 레슨생 일정에서도 빠지고, 그 시간은 다시 빈시간으로 열립니다.'
                  : '이 보강 내역을 지울까요? 지운 뒤에는 목록에서 사라집니다.'
              }
              confirmLabel={busyId === req.id ? '삭제 중' : '삭제'}
              onCancel={() => {
                if (busyId) return;
                setAskId('');
              }}
              onConfirm={() => remove(req.id)}
            />
          ) : null}
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
            {req.status !== 'accepted' ? (
              <View style={{ flex: 1 }}>
                <Button
                  label={busyId === req.id ? '처리 중' : '수락으로 수정'}
                  disabled={Boolean(busyId)}
                  onPress={() => revise(req.id, 'accept')}
                />
              </View>
            ) : (
              <View style={{ flex: 1 }}>
                <Button
                  tone="ghost"
                  label={busyId === req.id ? '처리 중' : '거절로 수정'}
                  disabled={Boolean(busyId)}
                  onPress={() => revise(req.id, 'decline')}
                />
              </View>
            )}
            {req.status !== 'withdrawn' ? (
              <View style={{ flex: 1 }}>
                <Button
                  tone="ghost"
                  label={busyId === req.id ? '처리 중' : '철회'}
                  disabled={Boolean(busyId)}
                  onPress={() => revise(req.id, 'withdraw')}
                />
              </View>
            ) : (
              <View style={{ flex: 1 }}>
                <Button
                  tone="ghost"
                  label={busyId === req.id ? '처리 중' : '거절로 수정'}
                  disabled={Boolean(busyId)}
                  onPress={() => revise(req.id, 'decline')}
                />
              </View>
            )}
          </View>
        </Card>
      ))}
    </>
  );
}
