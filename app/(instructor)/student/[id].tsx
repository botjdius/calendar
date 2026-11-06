import * as Clipboard from 'expo-clipboard';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { DateField, TimeField, timeLabel } from '../../../src/MonthCal';
import { FileAttachButton, FileAttachError } from '../../../src/FileAttachButton';
import { openSessionFile } from '../../../src/files';
import { PaymentBox, PaymentPillLabel } from '../../../src/PaymentBox';
import { ScrollPad } from '../../../src/ScrollPad';
import {
  closureLabel,
  continuingPackOptions,
  formatTime12,
  inferContinuingPack,
  isHolidaySession,
  isSyntheticHolidayHold,
  isLockedSession,
  isClosureActive,
  isPublicClosure,
  lastRealSession,
  paymentBadge,
  sessionLabel,
  sortSessions,
  splitSessionsAroundToday,
  todayIso,
  WEEKDAYS,
  wrapCycle,
} from '../../../src/schedule';
import { sessionStats, useStore } from '../../../src/store';
import { colors } from '../../../src/theme';
import type { CycleIndex, LessonSession } from '../../../src/types';
import { studentShareLink, useLanInfo } from '../../../src/share';
import { MonthlyGoalsSection } from '../../../src/MonthlyGoalsSection';
import { LessonContentView } from '../../../src/LessonContentView';
import { LessonNoteChecklistTools } from '../../../src/LessonNoteChecklistTools';
import { useKeyedSaveFeedback } from '../../../src/useSaveActionFeedback';
import { Button, Card, ConfirmBox, Field, Fold, Loading, Pill, Screen } from '../../../src/ui';

function paramId(value: string | string[] | undefined) {
  if (Array.isArray(value)) return String(value[0] || '');
  return String(value || '');
}

export default function StudentDetail() {
  const rawId = useLocalSearchParams<{ id?: string | string[] }>().id;
  const id = paramId(rawId);
  const {
    ready,
    students,
    setSessionStatus,
    setSessionDate,
    setSessionTime,
    setFixedTime,
    applyLessonSetup,
    applyFixedSchedule,
    addSession,
    removeSession,
    setMakeup,
    requests,
    setInstructorNote,
    addSessionFile,
    removeSessionFile,
    setPackPayment,
    closures,
    hubUrl,
  } = useStore();
  const router = useRouter();
  const student = students.find((s) => s.id === id);

  function goList() {
    if (router.canGoBack()) router.back();
    else router.replace('/(instructor)');
  }
  const [time, setTime] = useState(student?.time ?? '14:00');
  const [weekday, setWeekday] = useState(student?.weekday ?? 3);
  const [startCycle, setStartCycle] = useState<CycleIndex>(1);
  const [firstDate, setFirstDate] = useState('');
  const [makeupDate, setMakeupDate] = useState<Record<string, string>>({});
  const [makeupTime, setMakeupTime] = useState<Record<string, string>>({});
  const [sessionTimes, setSessionTimes] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [askRemoveSessionId, setAskRemoveSessionId] = useState('');
  const [removingSessionId, setRemovingSessionId] = useState('');
  const [sessionRemoveError, setSessionRemoveError] = useState<Record<string, string>>({});
  const [editLessonId, setEditLessonId] = useState('');
  const [editMakeupId, setEditMakeupId] = useState('');
  const [addCycle, setAddCycle] = useState<CycleIndex>(1);
  const [addPack, setAddPack] = useState(0);
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [fileError, setFileError] = useState<Record<string, string>>({});
  const lan = useLanInfo();
  const shareLink = student ? studentShareLink(student.joinCode, lan) : '';
  const saveFeedback = useKeyedSaveFeedback();

  useEffect(() => {
    if (student) {
      setTime(student.time || '14:00');
      setWeekday(Number.isInteger(student.weekday) ? student.weekday : 3);
      setStartCycle(student.startCycle || 1);
      setFirstDate(
        sortSessions(student.sessions).find((s) => s.date && !isLockedSession(s) && !isHolidaySession(s))?.date ||
          sortSessions(student.sessions).find((s) => s.date)?.date ||
          ''
      );
    }
  }, [student?.id]);

  useEffect(() => {
    if (!student) return;
    const last = lastRealSession(student.sessions);
    const nextCycle = last ? wrapCycle(last.cycle + 1) : student.startCycle || 1;
    setAddCycle(nextCycle);
    setAddPack(inferContinuingPack(last, nextCycle));
  }, [student?.id, student?.sessions.length]);

  useEffect(() => {
    if (!student) return;
    const last = lastRealSession(student.sessions);
    setAddPack(inferContinuingPack(last, addCycle));
  }, [student?.id, addCycle]);

  if (!ready) {
    return <Loading />;
  }

  if (!student) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
        <Screen title="레슨생을 찾지 못했습니다" subtitle="목록에서 다시 열어 주세요.">
          <Button label="목록으로" onPress={goList} />
        </Screen>
      </SafeAreaView>
    );
  }

  const lessonCard = student;
  const st = sessionStats(lessonCard);
  const today = todayIso();
  const { upcoming, past } = splitSessionsAroundToday(lessonCard.sessions, today);
  const badge = PaymentPillLabel(paymentBadge(lessonCard));
  const packChoices = continuingPackOptions(lessonCard.sessions);

  function commitSetup(patch: { weekday?: number; time?: string; startCycle?: CycleIndex; firstDate?: string }) {
    const nextWeekday = patch.weekday ?? weekday;
    const nextTime = patch.time ?? time;
    const nextCycle = patch.startCycle ?? startCycle;
    const nextFirst = patch.firstDate ?? firstDate;
    if (patch.weekday !== undefined) setWeekday(patch.weekday);
    if (patch.time !== undefined) setTime(patch.time);
    if (patch.startCycle !== undefined) setStartCycle(patch.startCycle);
    if (patch.firstDate !== undefined) setFirstDate(patch.firstDate);
    applyLessonSetup(lessonCard.id, {
      weekday: nextWeekday,
      time: nextTime,
      startCycle: nextCycle,
      firstDate: nextFirst || undefined,
    });
  }

  function makeupStatusLabel(session: LessonSession) {
    if (!session.makeup) return '';
    if (session.makeup.status === 'done') return ' · 완료(대체)';
    if (session.makeup.status === 'absent') return ' · 불참';
    const accepted = requests.some(
      (r) =>
        r.studentId === lessonCard.id &&
        r.sessionId === session.id &&
        r.status === 'accepted' &&
        r.date === session.makeup?.date &&
        r.time === session.makeup?.time
    );
    if (accepted) return ' · 신청 수락으로 등록';
    return ' · 예정';
  }

  function renderSession(session: LessonSession) {
    const holiday = isHolidaySession(session);
    const lessonOpen = editLessonId === session.id;
    const makeupOpen = editMakeupId === session.id;
    const makeupKey = `makeup:${session.id}`;
    const noteKey = `note:${session.id}`;
    const statusKey = (kind: string) => `status:${session.id}:${kind}`;
    return (
      <Card key={session.id}>
        <Text style={{ fontWeight: '800', fontSize: 18 }}>
          {(session.pack ?? 0) + 1}묶음 · {session.cycle}회
        </Text>
        <Text
          style={{
            color: holiday ? colors.wine : colors.muted,
            marginTop: 4,
            fontWeight: holiday ? '800' : '600',
          }}
        >
          {sessionLabel(session)}
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', marginTop: 6, gap: 10 }}>
          <Pressable
            onPress={() => {
              setEditLessonId(lessonOpen ? '' : session.id);
              if (!lessonOpen) setEditMakeupId('');
            }}
          >
            <Text style={{ fontWeight: '700' }}>
              {isSyntheticHolidayHold(session)
                ? `해당 주 ${timeLabel(session.date)} ${formatTime12(session.time)}`
                : `${holiday ? '휴강' : '레슨'} ${timeLabel(session.date)} ${formatTime12(session.time)}`}
            </Text>
          </Pressable>
          {holiday ? null : (
            <>
              <Pressable
                onPress={() => {
                  const nextOpen = !makeupOpen;
                  setEditMakeupId(nextOpen ? session.id : '');
                  if (nextOpen) {
                    setEditLessonId('');
                    setMakeupDate((p) => ({ ...p, [session.id]: p[session.id] ?? session.makeup?.date ?? '' }));
                    setMakeupTime((p) => ({ ...p, [session.id]: p[session.id] ?? session.makeup?.time ?? session.time }));
                  }
                }}
              >
                <Text style={{ color: colors.clay, fontWeight: '800' }}>보강</Text>
              </Pressable>
              {session.makeup ? (
                <Text style={{ color: colors.clay, fontWeight: '700' }}>
                  {timeLabel(session.makeup.date)} {formatTime12(session.makeup.time)}
                  {makeupStatusLabel(session)}
                </Text>
              ) : null}
            </>
          )}
        </View>
        {holiday && isSyntheticHolidayHold(session) ? (
          <Text style={{ color: colors.wine, marginTop: 8, fontWeight: '800' }}>
            휴강으로 다음주로 이동 · 다음 주에 {session.cycle}회가 다시 시작합니다.
          </Text>
        ) : holiday ? (
          <Text style={{ color: colors.wine, marginTop: 8, fontWeight: '800' }}>
            다음 주에 {session.cycle}회가 다시 시작합니다.
          </Text>
        ) : !holiday ? (
          <>
            <PaymentBox
              student={lessonCard}
              session={session}
              onToggle={(pack, paid, paidAt, sessionId) => setPackPayment(lessonCard.id, pack, paid, paidAt, sessionId)}
            />
            {lessonOpen ? (
              <>
                <DateField
                  defaultOpen
                  label="레슨 날짜"
                  value={session.date}
                  onChange={(iso) => setSessionDate(lessonCard.id, session.id, iso)}
                />
                <TimeField
                  label="레슨 시간"
                  value={sessionTimes[session.id] ?? session.time}
                  onChange={(t) => {
                    setSessionTimes((p) => ({ ...p, [session.id]: t }));
                    setSessionTime(lessonCard.id, session.id, t);
                  }}
                />
              </>
            ) : null}
            {makeupOpen ? (
              <>
                <DateField
                  defaultOpen
                  label="보강 날짜 (과거·미래 가능)"
                  value={makeupDate[session.id] ?? session.makeup?.date ?? ''}
                  onChange={(iso) => setMakeupDate((p) => ({ ...p, [session.id]: iso }))}
                />
                <TimeField
                  label="보강 시간"
                  value={makeupTime[session.id] ?? session.makeup?.time ?? session.time}
                  onChange={(t) => setMakeupTime((p) => ({ ...p, [session.id]: t }))}
                />
                <Button
                  label={saveFeedback.buttonLabel(makeupKey, '이 회차 보강으로 대체')}
                  disabled={saveFeedback.busy(makeupKey)}
                  onPress={() => {
                    const date = makeupDate[session.id] || session.makeup?.date;
                    const t = makeupTime[session.id] || session.makeup?.time || session.time;
                    if (!date) return;
                    void saveFeedback.run(makeupKey, () =>
                      setMakeup(lessonCard.id, session.id, { date, time: t, status: 'planned' })
                    );
                  }}
                />
                {session.makeup ? (
                  <Button
                    tone="ghost"
                    label={saveFeedback.buttonLabel(`${makeupKey}:clear`, '보강 취소')}
                    disabled={saveFeedback.busy(`${makeupKey}:clear`)}
                    onPress={() =>
                      void saveFeedback.run(`${makeupKey}:clear`, () => setMakeup(lessonCard.id, session.id, null))
                    }
                  />
                ) : null}
              </>
            ) : null}
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
              <View style={{ flex: 1 }}>
                <Button
                  label={saveFeedback.buttonLabel(statusKey('attended'), '출석')}
                  tone="clay"
                  disabled={saveFeedback.busy(statusKey('attended'))}
                  onPress={() =>
                    void saveFeedback.run(statusKey('attended'), () =>
                      setSessionStatus(lessonCard.id, session.id, 'attended')
                    )
                  }
                />
              </View>
              <View style={{ flex: 1 }}>
                <Button
                  label={saveFeedback.buttonLabel(statusKey('absent'), '불참')}
                  tone="wine"
                  disabled={saveFeedback.busy(statusKey('absent'))}
                  onPress={() =>
                    void saveFeedback.run(statusKey('absent'), () =>
                      setSessionStatus(lessonCard.id, session.id, 'absent')
                    )
                  }
                />
              </View>
            </View>
            <Button
              tone="ghost"
              label={saveFeedback.buttonLabel(statusKey('pending'), '대기로')}
              disabled={saveFeedback.busy(statusKey('pending'))}
              onPress={() =>
                void saveFeedback.run(statusKey('pending'), () =>
                  setSessionStatus(lessonCard.id, session.id, 'pending')
                )
              }
            />
            <LessonContentView note={session.note} checkedIds={session.checklistChecked} />
            <Field
              label="수업 내용"
              value={notes[session.id] ?? session.note}
              onChangeText={(t) => setNotes((p) => ({ ...p, [session.id]: t }))}
              placeholder="이번 회차 메모 (체크 항목은 아래 버튼으로 넣을 수 있습니다)"
              multiline
              autoCapitalize="sentences"
            />
            <LessonNoteChecklistTools
              note={notes[session.id] ?? session.note}
              onChangeNote={(next) => setNotes((p) => ({ ...p, [session.id]: next }))}
            />
            <Button
              label={saveFeedback.buttonLabel(noteKey, '수업 내용 저장')}
              disabled={saveFeedback.busy(noteKey)}
              onPress={() =>
                void saveFeedback.run(noteKey, async () => {
                  const text = notes[session.id] ?? session.note;
                  await setInstructorNote(lessonCard.id, session.id, text);
                  setNotes((p) => {
                    if (p[session.id] === undefined) return p;
                    const next = { ...p };
                    delete next[session.id];
                    return next;
                  });
                })
              }
            />
            {(session.attachments || []).map((f) => (
              <View
                key={f.id}
                style={{ marginTop: 8, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12 }}
              >
                <Pressable
                  onPress={() => {
                    void (async () => {
                      try {
                        setFileError((prev) => ({ ...prev, [session.id]: '' }));
                        await openSessionFile(f);
                      } catch (err) {
                        setFileError((prev) => ({
                          ...prev,
                          [session.id]: err instanceof Error ? err.message : '파일을 열지 못했습니다.',
                        }));
                      }
                    })();
                  }}
                >
                  <Text style={{ color: colors.pine, fontWeight: '800', textDecorationLine: 'underline' }}>{f.name}</Text>
                </Pressable>
                <Pressable
                  onPress={async () => {
                    try {
                      await removeSessionFile(lessonCard.id, session.id, f.id);
                      setFileError((prev) => ({ ...prev, [session.id]: '' }));
                    } catch (err) {
                      setFileError((prev) => ({
                        ...prev,
                        [session.id]: err instanceof Error ? err.message : '첨부 파일을 삭제하지 못했습니다.',
                      }));
                    }
                  }}
                >
                  <Text style={{ color: colors.wine, fontWeight: '800' }}>첨부 삭제</Text>
                </Pressable>
              </View>
            ))}
            <FileAttachButton
              hubBase={hubUrl || null}
              onFile={async (file) => {
                try {
                  await addSessionFile(lessonCard.id, session.id, file);
                  setFileError((prev) => ({ ...prev, [session.id]: '' }));
                } catch (err) {
                  setFileError((prev) => ({
                    ...prev,
                    [session.id]: err instanceof Error ? err.message : '첨부 파일을 저장하지 못했습니다.',
                  }));
                  throw err;
                }
              }}
              onError={(message) => setFileError((prev) => ({ ...prev, [session.id]: message }))}
            />
            <FileAttachError message={fileError[session.id] || ''} />
          </>
        ) : null}
        {askRemoveSessionId === session.id ? (
          <ConfirmBox
            title="회차 삭제"
            message={
              sessionRemoveError[session.id] ||
              (removingSessionId === session.id
                ? '회차를 삭제하고 있습니다…'
                : `${session.cycle}회를 지울까요? 메모·보강도 함께 사라집니다.`)
            }
            confirmLabel={removingSessionId === session.id ? '삭제 중' : '삭제'}
            onCancel={() => {
              if (removingSessionId) return;
              setAskRemoveSessionId('');
              setSessionRemoveError((prev) => ({ ...prev, [session.id]: '' }));
            }}
            onConfirm={async () => {
              if (removingSessionId) return;
              setRemovingSessionId(session.id);
              setSessionRemoveError((prev) => ({ ...prev, [session.id]: '' }));
              try {
                await removeSession(lessonCard.id, session.id);
                setAskRemoveSessionId('');
              } catch (error) {
                setSessionRemoveError((prev) => ({
                  ...prev,
                  [session.id]:
                    error instanceof Error ? error.message : '회차를 삭제하지 못했습니다. 다시 시도해 주세요.',
                }));
              } finally {
                setRemovingSessionId('');
              }
            }}
          />
        ) : (
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 12, gap: 8 }}>
            <View style={{ flex: 1 }}>
              <Button tone="ghost" label="회차 추가" onPress={() => addSession(lessonCard.id, session.id)} />
            </View>
            <View style={{ flex: 1 }}>
              <Button
                tone="wine"
                label="회차 삭제"
                onPress={() => {
                  setSessionRemoveError((prev) => ({ ...prev, [session.id]: '' }));
                  setAskRemoveSessionId(session.id);
                }}
              />
            </View>
          </View>
        )}
      </Card>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
        <Screen title={lessonCard.name} subtitle="회차는 1~4로 돌고, 각 회차를 추가·삭제할 수 있습니다.">
          <Button tone="ghost" label="목록으로" onPress={goList} />
          <MonthlyGoalsSection student={lessonCard} />
          <Card>
            <Fold title="가입코드">
            <Text selectable style={{ fontSize: 28, fontWeight: '800', color: colors.clay, letterSpacing: 2 }}>
              {lessonCard.joinCode || '없음'}
            </Text>
            <Text style={{ color: colors.muted, marginTop: 8, lineHeight: 22 }}>
              카톡으로 입장 링크를 보내면 레슨생이 이름만 확인하고 들어옵니다. 맥이나 같은 와이파이가 없어도 됩니다.
            </Text>
            {lessonCard.joinCode ? (
              <>
                <Button
                  label={copiedLink ? '복사됨' : shareLink ? '입장 링크 복사' : '공개 링크 준비 중'}
                  tone="clay"
                  onPress={async () => {
                    if (!shareLink) return;
                    await Clipboard.setStringAsync(shareLink);
                    setCopiedLink(true);
                    setTimeout(() => setCopiedLink(false), 1600);
                  }}
                />
                {shareLink ? (
                  <Text selectable style={{ color: colors.ink, fontWeight: '700', marginTop: 8, lineHeight: 22 }}>
                    {shareLink}
                  </Text>
                ) : null}
                <Button
                  label={copiedCode ? '복사됨' : '가입코드만 복사'}
                  tone="ghost"
                  onPress={async () => {
                    await Clipboard.setStringAsync(lessonCard.joinCode);
                    setCopiedCode(true);
                    setTimeout(() => setCopiedCode(false), 1600);
                  }}
                />
              </>
            ) : null}
            </Fold>
          </Card>
          <Card>
            <Fold title="고정 요일·시간">
            <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
              <Pill label={`카운트 ${st.counted}`} tone="pine" />
              <Pill label={`지금 ${st.currentCycle}회`} tone="clay" />
              <Pill label={`휴강 ${st.cancelled}`} tone="wine" />
              {badge ? <Pill label={badge.label} tone={badge.tone} /> : null}
            </View>
            <Text style={{ color: colors.muted, fontWeight: '600', marginBottom: 6 }}>고정 요일</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
              {WEEKDAYS.map((w, i) => (
                <Pressable
                  key={w}
                  onPress={() => commitSetup({ weekday: i })}
                  style={{
                    paddingHorizontal: 10,
                    paddingVertical: 8,
                    borderRadius: 10,
                    backgroundColor: weekday === i ? colors.pine : colors.pineSoft,
                  }}
                >
                  <Text style={{ color: weekday === i ? '#fff' : colors.pine, fontWeight: '800' }}>{w}</Text>
                </Pressable>
              ))}
            </View>
            <TimeField
              label="고정 시간"
              value={time}
              onChange={(t) => {
                setTime(t);
                setFixedTime(lessonCard.id, t);
              }}
            />
            <Text style={{ color: colors.muted, marginBottom: 12 }}>
              기본 시간만 바꿉니다. 이미 따로 적어 둔 회차 시간은 그대로 두고, 나중에 회차 카드에서 옮길 수 있습니다.
            </Text>
            <Text style={{ color: colors.muted, fontWeight: '600', marginBottom: 6 }}>시작 회차 (2회·3회부터 가능)</Text>
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
              {([1, 2, 3, 4] as CycleIndex[]).map((n) => (
                <Pressable
                  key={n}
                  onPress={() => commitSetup({ startCycle: n })}
                  style={{
                    flex: 1,
                    paddingVertical: 10,
                    borderRadius: 10,
                    alignItems: 'center',
                    backgroundColor: startCycle === n ? colors.clay : colors.claySoft,
                  }}
                >
                  <Text style={{ color: startCycle === n ? '#fff' : colors.clay, fontWeight: '800' }}>{n}회</Text>
                </Pressable>
              ))}
            </View>
            <DateField
              label="첫 레슨 날짜"
              value={firstDate}
              onChange={(iso) => commitSetup({ firstDate: iso })}
            />
            <Text style={{ color: colors.muted, marginBottom: 10 }}>
              고른 요일·시작 회차가 바로 적용됩니다. 날짜는 그 요일로 맞춰지고, 휴강 주는 같은 회차가 다음 주로 넘어갑니다.
            </Text>
            <Button
              label="이 요일·시간으로 4회 자동 등록"
              tone="clay"
              onPress={() =>
                applyFixedSchedule(lessonCard.id, {
                  weekday,
                  time,
                  startCycle,
                  firstDate: firstDate || undefined,
                })
              }
            />
            </Fold>
          </Card>

          {closures.filter((c) => isPublicClosure(c) && isClosureActive(c)).length > 0 ? (
            <Card>
              <Text style={{ fontWeight: '800', color: colors.wine, marginBottom: 6 }}>전체 휴강</Text>
              {closures.filter((c) => isPublicClosure(c) && isClosureActive(c)).map((c) => (
                <Text key={c.id} style={{ color: colors.wine, fontWeight: '700', marginTop: 6 }}>
                  {closureLabel(c)}
                </Text>
              ))}
            </Card>
          ) : null}

          {past.length > 0 ? (
            <Fold title={`지난 일정 (${past.length})`}>
              {past.map((session) => renderSession(session))}
            </Fold>
          ) : null}
          {upcoming.length > 0 ? (
            <Text style={{ fontWeight: '800', fontSize: 16, color: colors.ink, marginBottom: 8 }}>오늘부터</Text>
          ) : null}
          {upcoming.map((session) => renderSession(session))}

          <Card>
            <Fold title="이어서 추가">
            <Text style={{ color: colors.muted, marginBottom: 8 }}>
              회차·묶음을 고르면 맨 뒤에 하나 붙습니다. 날짜는 가장 늦은 레슨의 일주일 뒤, 시간은 고정 시간입니다.
            </Text>
            <Text style={{ color: colors.muted, fontWeight: '600', marginBottom: 6 }}>묶음</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
              {packChoices.map((pack) => (
                <Pressable
                  key={pack}
                  onPress={() => setAddPack(pack)}
                  style={{
                    paddingHorizontal: 14,
                    paddingVertical: 10,
                    borderRadius: 10,
                    backgroundColor: addPack === pack ? colors.pine : colors.pineSoft,
                  }}
                >
                  <Text style={{ color: addPack === pack ? '#fff' : colors.pine, fontWeight: '800' }}>{pack + 1}묶음</Text>
                </Pressable>
              ))}
            </View>
            <Text style={{ color: colors.muted, fontWeight: '600', marginBottom: 6 }}>회차</Text>
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
              {([1, 2, 3, 4] as CycleIndex[]).map((n) => (
                <Pressable
                  key={n}
                  onPress={() => setAddCycle(n)}
                  style={{
                    flex: 1,
                    paddingVertical: 10,
                    borderRadius: 10,
                    alignItems: 'center',
                    backgroundColor: addCycle === n ? colors.clay : colors.claySoft,
                  }}
                >
                  <Text style={{ color: addCycle === n ? '#fff' : colors.clay, fontWeight: '800' }}>{n}회</Text>
                </Pressable>
              ))}
            </View>
            <Button
              label={lessonCard.sessions.length ? `맨 뒤에 ${addCycle}회 추가` : `첫 회차 ${addCycle}회로 추가`}
              tone="clay"
              onPress={() => addSession(lessonCard.id, undefined, addCycle, addPack)}
            />
            </Fold>
          </Card>

          <ScrollPad />
        </Screen>
      </ScrollView>
    </SafeAreaView>
  );
}
