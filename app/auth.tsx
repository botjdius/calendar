import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { INSTRUCTOR_INVITE_CODE } from '../src/config';
import { isCloudConfigured } from '../src/cloud';
import { useStore } from '../src/store';
import { colors } from '../src/theme';
import { ScrollPad } from '../src/ScrollPad';
import { Button, Card, Field, Screen } from '../src/ui';

export default function AuthScreen() {
  const { signIn, signUp, firebaseOn, hubUrl, connectHub, lastLogin, clearLastLogin } = useStore();
  const router = useRouter();
  const savedStudent = lastLogin?.role === 'student' ? lastLogin : null;
  const savedInstructor = lastLogin?.role === 'instructor' ? lastLogin : null;
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [role, setRole] = useState<'student' | 'instructor'>(savedInstructor ? 'instructor' : 'student');
  const [name, setName] = useState(savedStudent?.name ?? savedInstructor?.name ?? '');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [otherStudent, setOtherStudent] = useState(!savedStudent);
  const [otherInstructor, setOtherInstructor] = useState(!savedInstructor);
  const [hub, setHub] = useState(hubUrl);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const instructorSignup = role === 'instructor' && mode === 'signup';

  useEffect(() => {
    if (hubUrl) setHub(hubUrl);
  }, [hubUrl]);

  useEffect(() => {
    if (savedStudent?.name) {
      setRole('student');
      setName(savedStudent.name);
      setOtherStudent(false);
    } else if (savedInstructor?.name) {
      setRole('instructor');
      setName(savedInstructor.name);
      setOtherInstructor(false);
    }
  }, [savedStudent?.name, savedStudent?.code, savedInstructor?.name]);

  useEffect(() => {
    if (!savedStudent?.name || !savedStudent.code || otherStudent || busy) return;
    let cancelled = false;
    (async () => {
      setBusy(true);
      try {
        await signIn({
          role: 'student',
          name: savedStudent.name,
          code: savedStudent.code || '',
          password: '',
        });
        if (!cancelled) router.replace('/');
      } catch {
        if (!cancelled) {
          await clearLastLogin();
          setOtherStudent(true);
          setName(savedStudent.name);
          setCode('');
          setMessage('저장된 가입코드로 들어가지 못했습니다. 강사에게 새로 받은 코드를 입력하세요.');
          setBusy(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [savedStudent?.name, savedStudent?.code, otherStudent]);

  useEffect(() => {
    if (!savedInstructor?.name || otherInstructor || otherStudent || savedStudent || busy) return;
    let cancelled = false;
    (async () => {
      setBusy(true);
      try {
        await signIn({
          role: 'instructor',
          name: savedInstructor.name,
          code: '',
          password: '',
        });
        if (!cancelled) router.replace('/');
      } catch {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [savedInstructor?.name, otherInstructor, otherStudent, savedStudent]);

  async function submit() {
    setMessage('');
    setBusy(true);
    try {
      if (!firebaseOn && !isCloudConfigured && role === 'student' && hub.trim() && (otherStudent || !savedStudent?.code)) {
        const ok = await connectHub(hub);
        if (!ok) {
          setMessage('처음 입장은 공개 주소가 필요합니다. 한 번 들어온 뒤에는 맥이 꺼져 있어도 됩니다.');
          return;
        }
      }
      const joinCode = role === 'student' && !otherStudent && savedStudent?.code ? savedStudent.code : code;
      const payload = {
        role,
        name: name || savedStudent?.name || savedInstructor?.name || '',
        code: joinCode,
        password,
      };
      if (role === 'student' || mode === 'login') {
        await signIn(payload);
      } else {
        await signUp(payload);
      }
      router.replace('/');
    } catch (e) {
      setMessage(e instanceof Error ? e.message : '처리할 수 없습니다.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1, paddingBottom: 24 }}>
        <Screen
          title={role === 'student' ? '레슨생 입장' : instructorSignup ? '강사 비밀번호 설정' : '강사 입장'}
          subtitle={
            role === 'instructor'
              ? '달력·설정·레슨생 상세는 강사 로그인만 있으면 됩니다. 맥 전원이나 와이파이와 관계없이 이 기기에 바로 저장됩니다.'
              : '이름과 가입코드만 입력하면 됩니다. 맥이나 같은 와이파이가 없어도 내 레슨·달력·보강 신청을 쓸 수 있습니다.'
          }
        >
          <Card>
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
              <RoleChip label="레슨생" active={role === 'student'} onPress={() => setRole('student')} />
              <RoleChip label="강사" active={role === 'instructor'} onPress={() => setRole('instructor')} />
            </View>
            {role === 'student' && savedStudent && !otherStudent ? (
              <>
                <Text style={{ fontWeight: '800', fontSize: 20, color: colors.ink, marginBottom: 6 }}>
                  {savedStudent.name}
                </Text>
                <Text style={{ color: colors.muted, marginBottom: 12, lineHeight: 22 }}>
                  이 기기에서 한 번 입장한 계정입니다. 가입코드 없이 바로 들어갑니다.
                </Text>
              </>
            ) : role === 'instructor' && savedInstructor && !otherInstructor && !instructorSignup ? (
              <>
                <Text style={{ fontWeight: '800', fontSize: 20, color: colors.ink, marginBottom: 6 }}>
                  {savedInstructor.name}
                </Text>
                <Text style={{ color: colors.muted, marginBottom: 12, lineHeight: 22 }}>
                  이 기기 강사 계정입니다. 맥이 꺼져 있어도 달력·설정·레슨생 상세를 바로 수정할 수 있습니다.
                </Text>
              </>
            ) : (
              <Field label="이름" value={name} onChangeText={setName} placeholder="레슨생 또는 강사 이름" autoCapitalize="words" />
            )}
            {role === 'student' && (otherStudent || !savedStudent) ? (
              <Field
                label="가입코드"
                value={code}
                onChangeText={setCode}
                placeholder="강사가 준 6자리"
                autoCapitalize="characters"
              />
            ) : role === 'instructor' && (instructorSignup || otherInstructor || !savedInstructor) ? (
              <>
                {instructorSignup ? (
                  <Field
                    label="강사 코드"
                    value={code}
                    onChangeText={setCode}
                    placeholder={INSTRUCTOR_INVITE_CODE}
                  />
                ) : null}
                <Field
                  label="비밀번호"
                  value={password}
                  onChangeText={setPassword}
                  placeholder="4자 이상. 재설정도 여기"
                  secure
                />
              </>
            ) : null}
            {!firebaseOn && !isCloudConfigured && role === 'student' && Platform.OS !== 'web' && (otherStudent || !savedStudent) ? (
              <Field
                label="허브 주소"
                value={hub}
                onChangeText={setHub}
                placeholder="공개 주소 또는 http://192.168.0.10:8787"
                autoCapitalize="none"
              />
            ) : null}
            {message ? <Text style={{ color: colors.wine, marginBottom: 8 }}>{message}</Text> : null}
            <Button
              label={
                busy
                  ? '잠시만요'
                  : role === 'student' && savedStudent && !otherStudent
                    ? `${savedStudent.name}으로 입장`
                    : role === 'instructor' && savedInstructor && !otherInstructor && !instructorSignup
                      ? `${savedInstructor.name}으로 입장`
                      : role === 'student'
                      ? '입장'
                      : instructorSignup
                        ? '비밀번호 저장하고 입장'
                        : '로그인'
              }
              onPress={submit}
              disabled={busy}
            />
            {role === 'student' && savedStudent && !otherStudent ? (
              <Button
                tone="ghost"
                label="다른 레슨생으로 입장"
                onPress={async () => {
                  await clearLastLogin();
                  setOtherStudent(true);
                  setName('');
                  setCode('');
                }}
              />
            ) : null}
            {role === 'instructor' && savedInstructor && !otherInstructor && !instructorSignup ? (
              <Button
                tone="ghost"
                label="다른 강사로 로그인"
                onPress={async () => {
                  await clearLastLogin();
                  setOtherInstructor(true);
                  setName('');
                  setPassword('');
                }}
              />
            ) : null}
            {role === 'instructor' ? (
              <Button
                tone="ghost"
                label={mode === 'login' ? '비밀번호를 재설정할래요' : '이미 강사 계정이 있어요'}
                onPress={() => {
                  setMode(mode === 'login' ? 'signup' : 'login');
                  setOtherInstructor(true);
                }}
              />
            ) : null}
          </Card>
          <ScrollPad />
        </Screen>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function RoleChip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        flex: 1,
        paddingVertical: 10,
        borderRadius: 12,
        alignItems: 'center',
        backgroundColor: active ? colors.pine : colors.pineSoft,
      }}
    >
      <Text style={{ color: active ? '#fff' : colors.pine, fontWeight: '800' }}>{label}</Text>
    </Pressable>
  );
}
