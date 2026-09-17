import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text } from 'react-native';
import { useStore } from '../../src/store';
import { colors } from '../../src/theme';
import { ScrollPad } from '../../src/ScrollPad';
import { Button, Card, Field, Loading, Screen } from '../../src/ui';

function paramCode(value: string | string[] | undefined) {
  if (Array.isArray(value)) return String(value[0] || '');
  return String(value || '');
}

export default function JoinByLink() {
  const raw = useLocalSearchParams<{ code?: string | string[] }>().code;
  const codeFromLink = paramCode(raw).trim().toUpperCase();
  const { ready, user, signIn, lastLogin } = useStore();
  const router = useRouter();
  const [name, setName] = useState(lastLogin?.role === 'student' ? lastLogin.name : '');
  const [code, setCode] = useState(codeFromLink);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (codeFromLink) setCode(codeFromLink);
  }, [codeFromLink]);

  async function submit(nextName = name, nextCode = code) {
    setError('');
    setBusy(true);
    try {
      await signIn({
        role: 'student',
        name: nextName.trim(),
        code: nextCode.trim(),
        password: '',
      });
      router.replace('/');
    } catch (e) {
      setError(e instanceof Error ? e.message : '링크로 입장하지 못했습니다.');
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!ready || user || !codeFromLink) return;
    void submit(lastLogin?.role === 'student' ? lastLogin.name : '', codeFromLink);
  }, [ready, user, codeFromLink]);

  if (!ready) return <Loading />;
  if (user) return <Redirect href="/" />;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1, paddingBottom: 24 }}>
        <Screen
          title="레슨생 입장"
          subtitle="이름과 가입코드를 입력하면 맥이나 같은 와이파이 없이 내 레슨을 볼 수 있습니다."
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
            {error ? <Text style={{ color: colors.wine, marginBottom: 8, fontWeight: '700' }}>{error}</Text> : null}
            <Button
              label={busy ? '잠시만요' : '입장'}
              onPress={() => submit()}
              disabled={busy}
            />
          </Card>
          <ScrollPad />
        </Screen>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
