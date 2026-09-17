import { useState } from 'react';
import { Text } from 'react-native';
import { formatTime12, pad } from './schedule';
import { colors } from './theme';
import type { AnonymousFeedback } from './types';
import { Button, Card, ConfirmBox, Fold } from './ui';

function feedbackWhen(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getMonth() + 1}월 ${d.getDate()}일 ${formatTime12(`${pad(d.getHours())}:${pad(d.getMinutes())}`)}`;
}

export function FeedbackInbox({
  items,
  onRemove,
}: {
  items: AnonymousFeedback[];
  onRemove?: (id: string) => Promise<void>;
}) {
  const [askId, setAskId] = useState('');
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');
  const list = [...(items || [])].sort(
    (a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')) || b.id.localeCompare(a.id)
  );
  if (!list.length) {
    return (
      <Card>
        <Text style={{ color: colors.muted, lineHeight: 22 }}>
          아직 도착한 익명 피드백이 없습니다. 레슨생이 설정 탭에서 보낸 글이 여기에 모입니다. 누가 보냈는지는 알 수 없습니다.
        </Text>
      </Card>
    );
  }
  return (
    <>
      {error ? (
        <Card style={{ backgroundColor: colors.wineSoft }}>
          <Text style={{ color: colors.wine, fontWeight: '700' }}>{error}</Text>
        </Card>
      ) : null}
      {list.map((item) => (
        <Card key={item.id}>
          <Fold title={`익명 · ${feedbackWhen(item.createdAt) || '날짜 없음'}`} defaultOpen={askId === item.id}>
            <Text style={{ color: colors.ink, fontWeight: '600', lineHeight: 24 }}>{item.body}</Text>
            {onRemove ? (
              askId === item.id ? (
                <ConfirmBox
                  title="피드백 삭제"
                  message="이 익명 글을 지울까요? 지운 뒤에는 다시 볼 수 없습니다."
                  confirmLabel={busyId === item.id ? '삭제 중' : '삭제'}
                  onCancel={() => {
                    if (busyId) return;
                    setAskId('');
                  }}
                  onConfirm={async () => {
                    if (busyId) return;
                    setBusyId(item.id);
                    setError('');
                    try {
                      await onRemove(item.id);
                      setAskId('');
                    } catch (err) {
                      setError(err instanceof Error ? err.message : '지우지 못했습니다.');
                    } finally {
                      setBusyId('');
                    }
                  }}
                />
              ) : (
                <Button
                  tone="wine"
                  label="삭제"
                  disabled={Boolean(busyId)}
                  onPress={() => {
                    setError('');
                    setAskId(item.id);
                  }}
                />
              )
            ) : null}
          </Fold>
        </Card>
      ))}
    </>
  );
}
