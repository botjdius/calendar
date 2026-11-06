import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { openSessionFile } from '../../src/files';
import { timeLabel } from '../../src/MonthCal';
import { ScrollPad } from '../../src/ScrollPad';
import {
  canRequestMakeupForSession,
  closureLabel,
  formatTime12,
  formatWeekly,
  isClosureActive,
  isHolidaySession,
  isPublicClosure,
  isSyntheticHolidayHold,
  makeupRequestLocked,
  paymentBadge,
  paymentBoxesForSession,
  sessionLabel,
  slotsForSessionMakeup,
  splitSessionsAroundToday,
  todayIso,
} from '../../src/schedule';
import { MonthlyGoalsSection } from '../../src/MonthlyGoalsSection';
import { StudentSessionChecklist } from '../../src/StudentSessionChecklist';
import { sessionStats, useStore } from '../../src/store';
import { isActiveMakeup } from '../../src/makeup';
import { StudentMakeupActions } from '../../src/StudentMakeupActions';
import { colors } from '../../src/theme';
import type { LessonSession } from '../../src/types';
import { Button, Card, Fold, Pill, Screen } from '../../src/ui';

function announcementDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('ko-KR', {
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default function StudentHome() {
  const router = useRouter();
  const {
    user,
    myStudent,
    studentRevoked,
    closures,
    openSlots,
    requests,
    announcements,
    requestMakeup,
    changeMakeup,
    withdrawMakeup,
  } = useStore();
  const [pickingSessionId, setPickingSessionId] = useState('');
  const [saving, setSaving] = useState('');
  const [requestError, setRequestError] = useState('');
  const [fileError, setFileError] = useState('');

  if (!myStudent) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
        <ScrollView contentContainerStyle={{ flexGrow: 1, paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
        <Screen
          title="내 레슨"
          subtitle={studentRevoked ? '연결된 레슨 카드가 없습니다.' : '강사가 회차를 넣으면 여기에 보입니다.'}
        >
          <Card>
            <Text style={{ color: colors.muted }}>
              {studentRevoked
                ? '이 레슨생 카드는 삭제되었습니다. 이후 달력·휴강·보강 안내는 보이지 않습니다.'
                : `${user?.name}님, 아직 표시할 레슨 기록이 없습니다.`}
            </Text>
          </Card>
          <ScrollPad />
        </Screen>
        </ScrollView>
      </SafeAreaView>
    );
  }

  const student = myStudent;
  const st = sessionStats(student);
  const publicClosures = closures.filter((closure) => isPublicClosure(closure) && isClosureActive(closure));
  const badge = paymentBadge(student);
  const { upcoming, past } = splitSessionsAroundToday(student.sessions, todayIso());
  const lessonFiles = student.sessions.flatMap((session) =>
    (session.attachments || []).map((file) => ({ file, session }))
  );
  const notices = [...announcements].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  async function openLessonFile(file: { id: string; name: string; uri: string; mime?: string }) {
    try {
      setFileError('');
      await openSessionFile(file);
    } catch (err) {
      setFileError(err instanceof Error ? err.message : '파일을 열지 못했습니다.');
    }
  }

  function renderSession(session: LessonSession) {
    return (
      <Card key={session.id}>
        <Text style={{ fontWeight: '800', fontSize: 18 }}>
          {(session.pack ?? 0) + 1}묶음 · {session.cycle}회
        </Text>
        <Text style={{ color: isHolidaySession(session) ? colors.wine : colors.muted, marginTop: 4, fontWeight: isHolidaySession(session) ? '800' : '600' }}>
          {sessionLabel(session)}
        </Text>
        <Text style={{ marginTop: 6, fontWeight: '700' }}>
          {isHolidaySession(session) ? '휴강' : '레슨'} {timeLabel(session.date)} {formatTime12(session.time)}
        </Text>
        {isHolidaySession(session) && !isSyntheticHolidayHold(session) ? (
          <Text style={{ color: colors.wine, marginTop: 8, fontWeight: '800' }}>
            다음 주에 {session.cycle}회가 다시 시작합니다.
          </Text>
        ) : !isHolidaySession(session) ? (
          <>
            {paymentBoxesForSession(student, session).map((p) => (
              <Text
                key={p.pack}
                style={{ color: p.paid ? colors.moss : colors.wine, fontWeight: '800', marginTop: 6 }}
              >
                {p.paid ? `결제 ${p.paidAt ? timeLabel(p.paidAt) : ''}` : '미결제'}
              </Text>
            ))}
            {session.makeup ? (
              <Text style={{ color: colors.clay, marginTop: 6, fontWeight: '700' }}>
                보강 {timeLabel(session.makeup.date)} {formatTime12(session.makeup.time)}
                {session.makeup.status === 'done' ? ' · 완료(대체)' : session.makeup.status === 'absent' ? ' · 불참' : ' · 예정'}
              </Text>
            ) : null}
            <StudentSessionChecklist student={student} session={session} />
            {(session.attachments || []).map((f) => (
              <Button
                key={f.id}
                tone="ghost"
                label={`파일 ${f.name}`}
                onPress={() => void openLessonFile(f)}
              />
            ))}
            {(() => {
              const mine = requests.find((r) => r.sessionId === session.id && isActiveMakeup(r));
              const locked = makeupRequestLocked(session.date);
              const canAsk = canRequestMakeupForSession(session);
              const sessionSlots = slotsForSessionMakeup(openSlots, session);
              if (session.status === 'attended') return null;
              if (mine) {
                return (
                  <StudentMakeupActions
                    request={mine}
                    session={session}
                    openSlots={openSlots}
                    saving={saving === session.id}
                    onWithdraw={withdrawMakeup}
                    onChange={changeMakeup}
                  />
                );
              }
              if (locked) {
                return (
                  <Text style={{ color: colors.muted, fontWeight: '700', marginTop: 10 }}>
                    레슨 3일 전부터는 보강 신청을 할 수 없습니다.
                  </Text>
                );
              }
              if (!canAsk) return null;
              if (pickingSessionId === session.id) {
                return (
                  <View style={{ marginTop: 10 }}>
                    <Text style={{ color: colors.muted, marginBottom: 6 }}>
                      이 회차 기준 앞뒤 1주 안의 보강 시간입니다.
                    </Text>
                    {sessionSlots.length === 0 ? (
                      <Text style={{ color: colors.wine, fontWeight: '700' }}>
                        이 회차 3주 안에 공개된 보강 시간이 없습니다.
                      </Text>
                    ) : (
                      sessionSlots.map((slot) => (
                        <Button
                          key={slot.id}
                          tone="clay"
                          disabled={saving === session.id}
                          label={
                            saving === session.id
                              ? '신청 중'
                              : `${timeLabel(slot.date)} ${formatTime12(slot.startTime)}${slot.endTime ? `–${formatTime12(slot.endTime)}` : ''}으로 신청`
                          }
                          onPress={async () => {
                            setSaving(session.id);
                            setRequestError('');
                            try {
                              await requestMakeup(slot.id, session.id);
                              setPickingSessionId('');
                            } catch (err) {
                              setRequestError(err instanceof Error ? err.message : '신청하지 못했습니다.');
                            } finally {
                              setSaving('');
                            }
                          }}
                        />
                      ))
                    )}
                    <Button tone="ghost" label="취소" onPress={() => setPickingSessionId('')} />
                  </View>
                );
              }
              return (
                <Button
                  tone="clay"
                  label="보강 신청"
                  onPress={() => {
                    setRequestError('');
                    setPickingSessionId(session.id);
                  }}
                />
              );
            })()}
          </>
        ) : null}
      </Card>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
        <Screen title={student.name} subtitle="내 회차만 보입니다. 휴강은 강사 달력에서 자동으로 밀립니다.">
          <MonthlyGoalsSection student={student} />
          {notices.length > 0 ? (
            <Card>
              <Text style={{ color: colors.clay, fontSize: 18, fontWeight: '900', marginBottom: 4 }}>
                공지사항
              </Text>
              {notices.map((item, index) => (
                <View
                  key={item.id}
                  style={{
                    paddingVertical: 12,
                    borderBottomWidth: index === notices.length - 1 ? 0 : 1,
                    borderBottomColor: colors.line,
                  }}
                >
                  <Text style={{ color: colors.ink, fontSize: 16, fontWeight: '900' }}>{item.title}</Text>
                  <Text style={{ color: colors.ink, lineHeight: 22, marginTop: 6 }}>{item.body}</Text>
                  <Text style={{ color: colors.muted, fontSize: 12, marginTop: 8 }}>
                    {announcementDate(item.createdAt)}
                    {item.expiresOn ? ` · ${item.expiresOn}까지 표시` : ''}
                  </Text>
                </View>
              ))}
            </Card>
          ) : null}
          {publicClosures.length > 0 ? (
            <Card>
              <Text style={{ fontWeight: '800', color: colors.wine, marginBottom: 6 }}>전체 휴강</Text>
              <Text style={{ color: colors.muted, marginBottom: 8 }}>
                강사가 올린 휴강일입니다. 해당 날짜의 대기 회차는 다음 주로 밀립니다.
              </Text>
              {publicClosures.map((c) => (
                <Text key={c.id} style={{ color: colors.wine, fontWeight: '700', marginTop: 6, lineHeight: 22 }}>
                  {closureLabel(c)}
                </Text>
              ))}
            </Card>
          ) : null}
          {requestError ? (
            <Card>
              <Text style={{ color: colors.wine, fontWeight: '700' }}>{requestError}</Text>
            </Card>
          ) : null}
          {fileError ? (
            <Card>
              <Text style={{ color: colors.wine, fontWeight: '700' }}>{fileError}</Text>
            </Card>
          ) : null}
          {lessonFiles.length > 0 ? (
            <Fold title={`수업 파일 (${lessonFiles.length})`}>
              <Text style={{ color: colors.muted, marginBottom: 8 }}>
                강사가 올린 파일입니다. 누르면 새 탭에서 열립니다.
              </Text>
              {lessonFiles.map(({ file, session }) => (
                <Button
                  key={`${session.id}-${file.id}`}
                  tone="ghost"
                  label={`파일 ${file.name}`}
                  onPress={() => void openLessonFile(file)}
                />
              ))}
            </Fold>
          ) : null}
          <Card>
            <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
              <Pill label={`카운트 ${st.counted}`} tone="pine" />
              <Pill label={`지금 ${st.currentCycle}회`} tone="clay" />
              {badge === 'unpaid' ? <Pill label="미결제" tone="wine" /> : badge === 'paid' ? <Pill label="결제" tone="moss" /> : null}
            </View>
            <Text style={{ marginTop: 12, color: colors.ink, fontWeight: '700' }}>
              고정 {formatWeekly(student.weekday, student.time) || '미정'}
            </Text>
          </Card>

          {past.length > 0 ? (
            <Fold title={`지난 일정 (${past.length})`}>
              {past.map(renderSession)}
            </Fold>
          ) : null}
          {upcoming.length > 0 ? (
            <Text style={{ fontWeight: '800', fontSize: 16, color: colors.ink, marginBottom: 8 }}>오늘부터</Text>
          ) : null}
          {upcoming.map(renderSession)}

          <ScrollPad />
        </Screen>
      </ScrollView>
    </SafeAreaView>
  );
}
