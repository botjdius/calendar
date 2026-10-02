import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BANK_MAX, bankLabel, emptyBank, packBanks } from '../../../src/hub';
import { INSTRUCTOR_INVITE_CODE } from '../../../src/config';
import { AnnouncementSender } from '../../../src/AnnouncementSender';
import { PhoneConnect } from '../../../src/PhoneConnect';
import { ScrollPad } from '../../../src/ScrollPad';
import { StudentRosterList } from '../../../src/StudentRosterList';
import { useStore } from '../../../src/store';
import { colors } from '../../../src/theme';
import type { BankAccount, Student } from '../../../src/types';
import { AccountCopy, Button, Card, Field, Fold, Pill, Screen } from '../../../src/ui';
import { WebPushSettings } from '../../../src/WebPushSettings';

function blankAccount(): BankAccount {
  return { ...emptyBank(), id: `new-${Date.now().toString(36)}` };
}

function draftsFrom(bank: BankAccount, banks: BankAccount[]) {
  const list = packBanks(bank, banks).banks;
  return list.length ? list : [blankAccount()];
}

export default function Settings() {
  const { user, syncMode, signOut, deleteMyAccount, students, removeStudent, bank, banks, saveBanks, saveInstructorName, feedback } = useStore();
  const router = useRouter();
  const [instructorName, setInstructorName] = useState(user?.name ?? '');
  const [nameSaved, setNameSaved] = useState(false);
  const [drafts, setDrafts] = useState<BankAccount[]>(() => draftsFrom(bank, banks));
  const [saved, setSaved] = useState(false);
  const [askDelete, setAskDelete] = useState<Student | null>(null);
  const [busyDelete, setBusyDelete] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const bankTouched = useRef(false);
  const appRegisteredCount = students.filter((student) => Boolean(student.linkedUid)).length;

  useEffect(() => {
    if (user?.name) setInstructorName(user.name);
  }, [user?.uid, user?.name]);

  useEffect(() => {
    if (bankTouched.current) return;
    setDrafts(draftsFrom(bank, banks));
  }, [user?.uid, banks, bank.accountNumber, bank.bankName, bank.accountHolder]);

  const syncLabel =
    syncMode === 'firebase'
      ? '클라우드로 모든 기기와 실시간 연동 중입니다.'
      : syncMode === 'hub'
        ? '맥 허브와 연결되어 있습니다. 여기서 바꾸면 다른 기기와 레슨생 화면도 맞춰집니다.'
        : syncMode === 'cloud'
          ? '웹 클라우드와 연결되어 있습니다. 레슨생은 로그인 링크로 맥 없이 들어옵니다.'
          : '달력·설정·레슨생 상세는 이 기기에 바로 저장됩니다. 맥이 꺼져 있거나 다른 와이파이여도 강사 로그인만 있으면 수정할 수 있습니다.';

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
        <Screen title="설정" subtitle="강사는 모든 레슨생 자료를 볼 수 있습니다.">
          <Card>
            <Fold title={`등록 레슨생 ${students.length}명 · 앱 등록 ${appRegisteredCount}명`}>
            <Text style={{ color: colors.muted, fontWeight: '700', lineHeight: 22 }}>
              앱 등록은 레슨생이 가입코드로 연결한 상태입니다. 이름을 누르면 상세로 가고, 휴대폰에서 길게 누르면 삭제 창이 열립니다.
            </Text>
            <StudentRosterList
              students={students}
              askDelete={askDelete}
              busy={busyDelete}
              error={deleteError}
              onOpen={(id) => {
                if (askDelete) return;
                router.push({ pathname: '/(instructor)/student/[id]', params: { id } });
              }}
              onAskDelete={(student) => {
                setDeleteError('');
                setAskDelete(student);
              }}
              onCancel={() => {
                setAskDelete(null);
                setDeleteError('');
              }}
              onConfirm={async () => {
                if (!askDelete || busyDelete) return;
                setBusyDelete(true);
                setDeleteError('');
                try {
                  await removeStudent(askDelete.id);
                  setAskDelete(null);
                } catch (err) {
                  setDeleteError(err instanceof Error ? err.message : '레슨생을 삭제하지 못했습니다.');
                } finally {
                  setBusyDelete(false);
                }
              }}
            />
            </Fold>
          </Card>
          <Card>
            <AnnouncementSender students={students} />
          </Card>
          <Card>
            <Fold title={feedback.length ? `익명 피드백 (${feedback.length})` : '익명 피드백'}>
            <Text style={{ color: colors.muted, fontWeight: '700', lineHeight: 22, marginBottom: 8 }}>
              레슨생이 이름 없이 보낸 말입니다. 누가 적었는지는 알 수 없습니다.
            </Text>
            <Button
              label={feedback.length ? `피드백 모아보기 (${feedback.length})` : '피드백 모아보기'}
              tone="clay"
              onPress={() => router.push('/(instructor)/feedback')}
            />
            </Fold>
          </Card>
          <Card>
            <Fold
              title="입금계좌 등록"
              action={
                drafts.length < BANK_MAX ? (
                  <Pressable
                    onPress={() => {
                      bankTouched.current = true;
                      setDrafts((prev) => (prev.length >= BANK_MAX ? prev : [...prev, blankAccount()]));
                    }}
                  >
                    <Text style={{ color: colors.clay, fontWeight: '800' }}>추가</Text>
                  </Pressable>
                ) : null
              }
            >
              {drafts.map((item, index) => (
                <View key={item.id || String(index)} style={{ marginBottom: index === drafts.length - 1 ? 0 : 16 }}>
                  <Text style={{ fontWeight: '800', color: colors.ink, marginBottom: 8 }}>{bankLabel(item)}</Text>
                  <Field
                    label="은행"
                    value={item.bankName}
                    onChangeText={(t) => {
                      bankTouched.current = true;
                      setDrafts((prev) => prev.map((row, i) => (i === index ? { ...row, bankName: t } : row)));
                    }}
                    placeholder="예: 카카오뱅크"
                  />
                  <Field
                    label="계좌번호"
                    value={item.accountNumber}
                    onChangeText={(t) => {
                      bankTouched.current = true;
                      setDrafts((prev) => prev.map((row, i) => (i === index ? { ...row, accountNumber: t } : row)));
                    }}
                    placeholder="3333-00-0000000"
                  />
                  <Field
                    label="예금주"
                    value={item.accountHolder}
                    onChangeText={(t) => {
                      bankTouched.current = true;
                      setDrafts((prev) => prev.map((row, i) => (i === index ? { ...row, accountHolder: t } : row)));
                    }}
                    placeholder="이름"
                    autoCapitalize="words"
                  />
                </View>
              ))}
              <Button
                label={saved ? '저장됨' : '계좌 저장'}
                onPress={async () => {
                  await saveBanks(drafts);
                  setSaved(true);
                  setTimeout(() => setSaved(false), 1600);
                }}
              />
            </Fold>
          </Card>
          <AccountCopy
            bank={bank}
            banks={banks}
            onRemove={async (item) => {
              bankTouched.current = true;
              const packed = packBanks(bank, banks).banks;
              const next = packed.filter((row) => (item.id && row.id ? row.id !== item.id : row.bankName !== item.bankName || row.accountNumber !== item.accountNumber));
              setDrafts(next.length ? next : [blankAccount()]);
              await saveBanks(next);
            }}
          />
          <Card>
            <Fold title="강사 이름">
            <Pill label="강사" tone="pine" />
            <Field
              label="강사 이름"
              value={instructorName}
              onChangeText={setInstructorName}
              placeholder="강사 이름"
              autoCapitalize="words"
            />
            <Button
              label={nameSaved ? '저장됨' : '이름 저장'}
              onPress={async () => {
                await saveInstructorName(instructorName);
                setNameSaved(true);
                setTimeout(() => setNameSaved(false), 1600);
              }}
            />
            </Fold>
          </Card>
          <Card>
            <Fold title="맥 · 앱 연동">
            <Text style={{ color: colors.muted, lineHeight: 22 }}>{syncLabel}</Text>
            </Fold>
          </Card>
          <WebPushSettings />
          <PhoneConnect />
          <Card>
            <Fold title="강사 코드">
            <Text style={{ fontSize: 18, fontWeight: '700', color: colors.clay }}>{INSTRUCTOR_INVITE_CODE}</Text>
            <Text style={{ color: colors.muted, marginTop: 8 }}>
              다른 사람이 강사로 가입하지 않도록 코드를 지키세요. 레슨생은 이름과 가입코드로 입장합니다.
            </Text>
            </Fold>
          </Card>
          <Button tone="wine" label="로그아웃" onPress={() => signOut()} />
          <Button
            tone="ghost"
            label="탈퇴"
            onPress={() => {
              const go = () => {
                deleteMyAccount().catch(() => {});
              };
              if (Platform.OS === 'web') {
                if (typeof window !== 'undefined' && window.confirm('강사 계정을 탈퇴할까요?')) go();
                return;
              }
              Alert.alert('탈퇴', '강사 계정이 삭제됩니다.', [
                { text: '취소', style: 'cancel' },
                { text: '탈퇴', style: 'destructive', onPress: go },
              ]);
            }}
          />
          <ScrollPad />
        </Screen>
      </ScrollView>
    </SafeAreaView>
  );
}
