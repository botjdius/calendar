import { useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text } from 'react-native';
import { useStore } from '../src/store';
import { colors } from '../src/theme';
import { ScrollPad } from '../src/ScrollPad';
import { Button, Card, Field, Screen } from '../src/ui';

export default function InstructorEnter() {
  const { signIn, lastLogin } = useStore();
  const router = useRouter();
  const saved = lastLogin?.role === 'instructor' ? lastLogin : null;
  const [name, setName] = useState(saved?.name ?? '');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function submit() {
    setMessage('');
    setBusy(true);
    try {
      await signIn({
        role: 'instructor',
        name: name.trim(),
        code: '',
        password,
      });
      router.replace('/');
    } catch (e) {
      setMessage(e instanceof Error ? e.message : '로그인하지 못했습니다.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1, paddingBottom: 24 }}>
        <Screen
          title="강사 입장"
          subtitle="이름과 비밀번호만 입력하면 됩니다. 맥이나 같은 와이파이가 없어도 달력·설정·레슨생 상세를 쓸 수 있습니다."
        >
          <Card>
            <Field label="이름" value={name} onChangeText={setName} placeholder="강사 이름" autoCapitalize="words" />
            <Field
              label="비밀번호"
              value={password}
              onChangeText={setPassword}
              placeholder="4자 이상"
              secure
            />
            {message ? <Text style={{ color: colors.wine, marginBottom: 8 }}>{message}</Text> : null}
            <Button label={busy ? '잠시만요' : '로그인'} onPress={submit} disabled={busy} />
          </Card>
          <ScrollPad />
        </Screen>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
