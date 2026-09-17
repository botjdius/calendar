import { useState } from 'react';
import { Text, View } from 'react-native';
import { FEEDBACK_MAX } from './cloud';
import { colors } from './theme';
import { Button, Field } from './ui';

export function StudentFeedbackBox({ onSend }: { onSend: (body: string) => Promise<void> }) {
  const [body, setBody] = useState('');
  const [saving, setSaving] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  return (
    <View>
      <Text style={{ color: colors.muted, lineHeight: 22, marginBottom: 12 }}>
        이름·가입코드·계정 없이 완벽한 익명으로 강사에게만 전달됩니다. 레슨에서 불편한 점, 전하고 싶은 말, 컴플레인 등을 자유롭게 적어 주세요.
      </Text>
      <Field
        label="강사에게 전할 말"
        value={body}
        onChangeText={(t) => {
          setBody(t.slice(0, FEEDBACK_MAX));
          setSent(false);
          setError('');
        }}
        placeholder="불편한 점이나 전하고 싶은 말을 적어 주세요"
        multiline
        minHeight={120}
        autoCapitalize="sentences"
      />
      {error ? (
        <Text style={{ color: colors.wine, fontWeight: '700', marginBottom: 8 }}>{error}</Text>
      ) : null}
      {sent ? (
        <Text style={{ color: colors.moss, fontWeight: '700', marginBottom: 8 }}>익명으로 전달했습니다.</Text>
      ) : null}
      <Button
        label={saving ? '보내는 중' : '익명으로 보내기'}
        tone="clay"
        disabled={saving || !body.trim()}
        onPress={async () => {
          if (saving) return;
          setSaving(true);
          setError('');
          setSent(false);
          try {
            await onSend(body);
            setBody('');
            setSent(true);
          } catch (err) {
            setError(err instanceof Error ? err.message : '보내지 못했습니다.');
          } finally {
            setSaving(false);
          }
        }}
      />
    </View>
  );
}
