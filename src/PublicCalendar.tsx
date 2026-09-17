import { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { DateField, MonthCal, TimeField, timeLabel, type CalMark } from './MonthCal';
import { instructorMakeupEntries } from './makeup';
import { closureCovers, closureEnd, eachDay, formatTime12, isPublicClosure, sessionsForMakeupSlot, slotsForStudentMakeup, WEEKDAYS } from './schedule';
import { colors } from './theme';
import type { Closure, MakeupRequest, OpenSlot, Student } from './types';
import { isActiveMakeup, studentRequestLabel } from './makeup';
import { MakeupReview } from './MakeupReview';
import { ScrollPad } from './ScrollPad';
import { StudentMakeupActions } from './StudentMakeupActions';
import { Button, Card, Field, Fold, Screen } from './ui';

export function PublicCalendar({
  closures,
  openSlots,
  requests = [],
  students = [],
  myStudent,
  instructor,
  onAddClosure,
  onRemoveClosure,
  onAddSlot,
  onRemoveSlot,
  onRequestMakeup,
  onChangeMakeup,
  onWithdrawMakeup,
  onDecideMakeup,
  onOpenStudent,
}: {
  closures: Closure[];
  openSlots: OpenSlot[];
  requests?: MakeupRequest[];
  students?: Student[];
  myStudent?: Student | null;
  instructor?: boolean;
  onAddClosure?: (input: { date: string; endDate?: string; time: string; reason: string; scope: 'all' }) => Promise<void>;
  onRemoveClosure?: (id: string) => Promise<void>;
  onAddSlot?: (input: { date: string; startTime: string; endTime: string; note: string }) => Promise<void>;
  onRemoveSlot?: (id: string) => Promise<void>;
  onRequestMakeup?: (slotId: string, sessionId: string) => Promise<void>;
  onChangeMakeup?: (requestId: string, slotId: string, sessionId: string) => Promise<void>;
  onWithdrawMakeup?: (requestId: string) => Promise<void>;
  onDecideMakeup?: (requestId: string, accepted: boolean) => Promise<void>;
  onOpenStudent?: (studentId: string) => void;
}) {
  const [selected, setSelected] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [view, setView] = useState<'month' | 'week'>('month');
  const [reason, setReason] = useState('');
  const [cTime, setCTime] = useState('');
  const [startTime, setStartTime] = useState('10:00');
  const [endTime, setEndTime] = useState('11:00');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState('');
  const [pickingSlotId, setPickingSlotId] = useState('');
  const [requestError, setRequestError] = useState('');
  const myRequests = requests.filter((r) => !myStudent || r.studentId === myStudent.id);
  const visibleSlots = useMemo(() => {
    if (instructor) return openSlots;
    if (!myStudent) return [] as OpenSlot[];
    const windowedIds = new Set(slotsForStudentMakeup(openSlots, myStudent.sessions).map((s) => s.id));
    const fromRequests = openSlots.filter((s) =>
      myRequests.some((r) => r.slotId === s.id && r.status === 'pending')
    );
    const seen = new Set<string>();
    return openSlots.filter((slot) => {
      if (!windowedIds.has(slot.id) && !fromRequests.some((s) => s.id === slot.id)) return false;
      if (seen.has(slot.id)) return false;
      seen.add(slot.id);
      return true;
    });
  }, [instructor, myStudent, openSlots, myRequests]);

  const makeupDays = useMemo(
    () => (instructor ? instructorMakeupEntries(students) : []),
    [instructor, students]
  );

  const marks = useMemo(() => {
    const map: Record<string, CalMark[]> = {};
    const add = (iso: string, k: CalMark) => {
      if (!iso) return;
      map[iso] = [...(map[iso] ?? []), k];
    };
    closures.filter(isPublicClosure).forEach((c) => {
      eachDay(c.date, closureEnd(c)).forEach((iso) => add(iso, 'closure'));
    });
    visibleSlots.forEach((s) => add(s.date, 'slot'));
    makeupDays.forEach((row) => add(row.date, 'makeup'));
    return map;
  }, [closures, visibleSlots, makeupDays]);

  const publicClosures = closures.filter(isPublicClosure);
  const dayClosures = publicClosures.filter((c) => closureCovers(c, selected));
  const daySlots = visibleSlots.filter((s) => s.date === selected);
  const dayMakeups = makeupDays.filter((row) => row.date === selected);
  const byWeekday = WEEKDAYS.map((label, idx) => ({
    label,
    closures: publicClosures.filter((c) => eachDay(c.date, closureEnd(c)).some((iso) => new Date(iso + 'T12:00:00').getDay() === idx)),
    slots: visibleSlots.filter((s) => new Date(s.date + 'T12:00:00').getDay() === idx),
    makeups: makeupDays.filter((row) => new Date(row.date + 'T12:00:00').getDay() === idx),
  }));

  function pickDay(iso: string) {
    setSelected(iso);
    if (!startDate || (startDate && endDate)) {
      setStartDate(iso);
      setEndDate('');
      return;
    }
    if (iso < startDate) {
      setEndDate(startDate);
      setStartDate(iso);
      return;
    }
    setEndDate(iso);
  }

  const canRequest = Boolean(!instructor && myStudent && onRequestMakeup);

  function slotRequests(slotId: string) {
    return requests.filter((r) => r.slotId === slotId);
  }

  function mySlotRequest(slotId: string) {
    return myRequests.find((r) => r.slotId === slotId && isActiveMakeup(r))
      || myRequests.find((r) => r.slotId === slotId);
  }

  const myOpenRequests = myRequests.filter(isActiveMakeup);

  async function applySlot(slotId: string, sessionId: string) {
    if (!onRequestMakeup || saving) return;
    setSaving(slotId);
    setRequestError('');
    try {
      await onRequestMakeup(slotId, sessionId);
      setPickingSlotId('');
    } catch (err) {
      setRequestError(err instanceof Error ? err.message : '신청하지 못했습니다.');
    } finally {
      setSaving('');
    }
  }

  function SlotActions({ slot }: { slot: OpenSlot }) {
    const mine = mySlotRequest(slot.id);
    const pendingHere = slotRequests(slot.id).filter((r) => r.status === 'pending');
    return (
      <View style={{ marginTop: 8 }}>
        {instructor && pendingHere.length > 0 ? (
          <Text style={{ color: colors.clay, fontWeight: '700', marginBottom: 6 }}>
            신청 대기 {pendingHere.map((r) => `${r.studentName} ${r.sessionCycle}회`).join(', ')}
          </Text>
        ) : null}
        {canRequest && mine ? (
          <Text style={{ color: mine.status === 'declined' ? colors.wine : colors.clay, fontWeight: '700', marginBottom: 6 }}>
            {studentRequestLabel(mine)}
          </Text>
        ) : null}
        {canRequest && (!mine || mine.status === 'declined' || mine.status === 'withdrawn') ? (
          pickingSlotId === slot.id ? (
            <View>
              <Text style={{ color: colors.muted, marginBottom: 6 }}>바꿀 기존 레슨을 고르세요.</Text>
              {sessionsForMakeupSlot(myStudent?.sessions || [], slot.date).length === 0 ? (
                <Text style={{ color: colors.wine, fontWeight: '700' }}>이 시간에 바꿀 수 있는 내 레슨이 없습니다.</Text>
              ) : (
                sessionsForMakeupSlot(myStudent?.sessions || [], slot.date).map((session) => (
                  <Button
                    key={session.id}
                    tone="clay"
                    disabled={saving === slot.id}
                    label={
                      saving === slot.id
                        ? '신청 중'
                        : `${session.cycle}회 ${timeLabel(session.date)} ${formatTime12(session.time)} → 이 시간으로`
                    }
                    onPress={() => applySlot(slot.id, session.id)}
                  />
                ))
              )}
              <Button tone="ghost" label="취소" onPress={() => setPickingSlotId('')} />
            </View>
          ) : (
            <Button
              tone="clay"
              label="이 시간으로 보강 신청"
              onPress={() => {
                setRequestError('');
                setPickingSlotId(slot.id);
              }}
            />
          )
        ) : null}
      </View>
    );
  }

  function rangeLabel(c: { date: string; endDate?: string; time?: string }) {
    const end = closureEnd(c);
    const days = c.date === end ? timeLabel(c.date) : `${timeLabel(c.date)}–${timeLabel(end)}`;
    return `${days}${c.time ? ` ${formatTime12(c.time)}` : ''}`;
  }

  return (
    <Screen
      title="한달 달력"
      subtitle={instructor ? '휴강과 빈 시간을 등록하면 모든 레슨생에게 보입니다.' : '내 레슨일 기준 앞뒤 1주(3주 안)의 보강 시간만 보입니다. 레슨 3일 전부터는 신청할 수 없습니다.'}
    >
      {instructor && onDecideMakeup && requests.length > 0 ? (
        <MakeupReview requests={requests} onDecide={onDecideMakeup} onOpenStudent={onOpenStudent} />
      ) : null}

      {canRequest && myOpenRequests.length > 0 ? (
        <Card>
          <Text style={{ fontWeight: '800', color: colors.clay, marginBottom: 6 }}>보낸 보강 신청</Text>
          {myOpenRequests.map((r) => (
            <View key={r.id} style={{ marginTop: 8 }}>
              <Text style={{ color: colors.ink, fontWeight: '700' }}>
                {r.sessionCycle}회 {r.sessionDate ? timeLabel(r.sessionDate) : ''} → {timeLabel(r.date)} {formatTime12(r.time)} · {studentRequestLabel(r)}
              </Text>
              {myStudent && onChangeMakeup && onWithdrawMakeup ? (
                <StudentMakeupActions
                  request={r}
                  session={myStudent.sessions.find((s) => s.id === r.sessionId) || myStudent.sessions[0]}
                  openSlots={openSlots}
                  onWithdraw={onWithdrawMakeup}
                  onChange={onChangeMakeup}
                />
              ) : null}
            </View>
          ))}
        </Card>
      ) : null}

      {requestError ? (
        <Card>
          <Text style={{ color: colors.wine, fontWeight: '700' }}>{requestError}</Text>
        </Card>
      ) : null}

      {publicClosures.length > 0 ? (
        <Card>
          <Text style={{ fontWeight: '800', color: colors.wine, marginBottom: 6 }}>전체 휴강</Text>
          {publicClosures.map((c) => (
            <Text key={c.id} style={{ color: colors.wine, fontWeight: '700', marginTop: 6 }}>
              휴강 {rangeLabel(c)} {c.reason}
            </Text>
          ))}
        </Card>
      ) : (
        <Card>
          <Text style={{ color: colors.muted }}>등록된 전체 휴강이 없습니다.</Text>
        </Card>
      )}

      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10 }}>
        <View style={{ flex: 1 }}>
          <Button label="달력" tone={view === 'month' ? 'pine' : 'ghost'} onPress={() => setView('month')} />
        </View>
        <View style={{ flex: 1 }}>
          <Button label="요일별" tone={view === 'week' ? 'pine' : 'ghost'} onPress={() => setView('week')} />
        </View>
      </View>

      {view === 'month' ? (
        <Card>
          <MonthCal marks={marks} selected={selected} onSelect={instructor ? pickDay : setSelected} editable={instructor} />
        </Card>
      ) : (
        byWeekday.map((row) => (
          <Card key={row.label}>
            <Fold title={`${row.label}요일`}>
            {row.closures.length === 0 && row.slots.length === 0 && row.makeups.length === 0 ? (
              <Text style={{ color: colors.muted, marginTop: 6 }}>없음</Text>
            ) : (
              <>
                {row.closures.map((c) => (
                  <Text key={c.id} style={{ color: colors.wine, marginTop: 6 }}>
                    휴강 {rangeLabel(c)} {c.reason}
                  </Text>
                ))}
                {row.makeups.map((rowMakeup) => (
                  <Pressable
                    key={`${rowMakeup.studentId}:${rowMakeup.sessionId}`}
                    onPress={() => onOpenStudent?.(rowMakeup.studentId)}
                    disabled={!onOpenStudent}
                  >
                    <Text style={{ color: colors.clay, fontWeight: '700', marginTop: 8 }}>
                      {rowMakeup.label}
                    </Text>
                  </Pressable>
                ))}
                {row.slots.map((s) => (
                  <View key={s.id} style={{ marginTop: 8 }}>
                    <Text style={{ color: colors.moss, fontWeight: '700' }}>
                      보강 가능 {timeLabel(s.date)} {formatTime12(s.startTime)}–{formatTime12(s.endTime)} {s.note}
                    </Text>
                    <SlotActions slot={s} />
                  </View>
                ))}
              </>
            )}
            </Fold>
          </Card>
        ))
      )}

      {selected ? (
        <Card>
          <Text style={{ fontWeight: '800', marginBottom: 6 }}>{timeLabel(selected)}</Text>
          {dayClosures.length === 0 && daySlots.length === 0 && dayMakeups.length === 0 ? (
            <Text style={{ color: colors.muted }}>이 날 공개 일정이 없습니다.</Text>
          ) : null}
          {dayClosures.map((c) => (
            <View key={c.id} style={{ marginTop: 8 }}>
              <Text style={{ color: colors.wine, fontWeight: '700' }}>
                휴강 {rangeLabel(c)} · {c.reason || '하루'}
              </Text>
              {instructor && onRemoveClosure ? (
                <Button tone="ghost" label="휴강 삭제" onPress={() => onRemoveClosure(c.id)} />
              ) : null}
            </View>
          ))}
          {dayMakeups.map((row) => (
            <Pressable
              key={`${row.studentId}:${row.sessionId}`}
              onPress={() => onOpenStudent?.(row.studentId)}
              disabled={!onOpenStudent}
              style={{ marginTop: 8 }}
            >
              <Text style={{ color: colors.clay, fontWeight: '700' }}>{row.label}</Text>
            </Pressable>
          ))}
          {daySlots.map((s) => (
            <View key={s.id} style={{ marginTop: 8 }}>
              <Text style={{ color: colors.moss, fontWeight: '700' }}>
                보강 가능 {formatTime12(s.startTime)}–{formatTime12(s.endTime)} {s.note}
              </Text>
              <SlotActions slot={s} />
              {instructor && onRemoveSlot ? (
                <Button tone="ghost" label="빈 시간 삭제" onPress={() => onRemoveSlot(s.id)} />
              ) : null}
            </View>
          ))}
        </Card>
      ) : null}

      {instructor && onAddClosure && onAddSlot ? (
        <>
          <Card>
            <Fold title="휴강 등록">
            <Text style={{ color: colors.muted, marginBottom: 8 }}>달력에서 시작일을 누르고, 이어서 종료일을 누르세요.</Text>
            <DateField label="시작일" value={startDate} onChange={(iso) => { setStartDate(iso); setSelected(iso); }} marks={marks} />
            <DateField label="종료일" value={endDate || startDate} onChange={(iso) => { setEndDate(iso); setSelected(iso); }} marks={marks} />
            <TimeField label="시간 (비우면 기간 전체)" value={cTime} onChange={setCTime} allowEmpty />
            <Field label="이유" value={reason} onChangeText={setReason} placeholder="공휴일, 강사 사정" />
            <Button
              label={saving === 'closure' ? '저장 중' : '기간 휴강 올리고 해당 레슨 다음주로'}
              tone="wine"
              disabled={saving === 'closure'}
              onPress={async () => {
                if (!startDate || saving) return;
                const start = endDate && endDate < startDate ? endDate : startDate;
                const end = endDate && endDate < startDate ? startDate : endDate || startDate;
                setSaving('closure');
                try {
                  await onAddClosure({
                    date: start,
                    endDate: end,
                    time: cTime.trim(),
                    reason: reason.trim(),
                    scope: 'all',
                  });
                  setReason('');
                  setCTime('');
                } finally {
                  setSaving('');
                }
              }}
            />
            </Fold>
          </Card>
          <Card>
            <Fold title="빈 시간 공개">
            <DateField label="날짜" value={selected} onChange={setSelected} marks={marks} />
            <TimeField label="시작" value={startTime} onChange={setStartTime} />
            <TimeField label="끝" value={endTime} onChange={setEndTime} />
            <Field label="메모" value={note} onChangeText={setNote} placeholder="보강 가능" />
            <Button
              label={saving === 'slot' ? '저장 중' : '빈 시간 올리기'}
              disabled={saving === 'slot'}
              onPress={async () => {
                if (!selected || !startTime.trim() || saving) return;
                setSaving('slot');
                try {
                  await onAddSlot({
                    date: selected,
                    startTime: startTime.trim(),
                    endTime: endTime.trim(),
                    note: note.trim(),
                  });
                  setStartTime('');
                  setEndTime('');
                  setNote('');
                } finally {
                  setSaving('');
                }
              }}
            />
            </Fold>
          </Card>
        </>
      ) : null}
      <ScrollPad />
    </Screen>
  );
}
