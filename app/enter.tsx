import { useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text } from 'react-native';
import { useStore } from '../src/store';
import { colors } from '../src/theme';
import { ScrollPad } from '../src/ScrollPad';
import { Button, Card, Field, Screen } from '../src/ui';

export default function StudentEnter() {
  const { signIn, lastLogin } = useStore();
  const router = useRouter();
  const saved = lastLogin?.role === 'student' ? lastLogin : null;
  const [name, setName] = useState(saved?.name ?? '');
  const [code, setCode] = useState(saved?.code ?? '');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function submit() {
    setMessage('');
    setBusy(true);
    try {
      await signIn({
        role: 'student',
        name: name.trim(),
        code: code.trim(),
        password: '',
      });
      router.replace('/');
    } catch (e) {
      setMessage(e instanceof Error ? e.message : '입장하지 못했습니다.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1, paddingBottom: 24 }}>
        <Screen
          title="레슨생 입장"
          subtitle="이름과 가입코드만 입력하면 됩니다. 맥이나 같은 와이파이가 없어도 내 레슨·달력·보강 신청을 쓸 수 있습니다."
        >
          <Card>
            <Field label="이름" value={name} onChangeText={setName} placeholder="레슨생 이름" autoCapitalize="words" />
            <Field
              label="가입코드"
              value={code}
              onChangeText={setCode}
              placeholder="강사가 준 6자리"
              autoCapitalize="characters"
            />
            {message ? <Text style={{ color: colors.wine, marginBottom: 8 }}>{message}</Text> : null}
            <Button label={busy ? '잠시만요' : '입장'} onPress={submit} disabled={busy} />
          </Card>
          <ScrollPad />
        </Screen>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
