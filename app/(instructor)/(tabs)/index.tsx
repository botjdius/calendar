import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { DateField, TimeField } from '../../../src/MonthCal';
import { ScrollPad } from '../../../src/ScrollPad';
import { originalLessonStamp } from '../../../src/makeup';
import { formatTime12, hideFromLessonCheck, isHolidaySession, lessonCheckHolidayDays, lessonCheckPayNotes, lessonDisplayDate, normalizeTime, parseIso, splitSessionsAroundToday, todayIso, WEEKDAYS } from '../../../src/schedule';
import { useStore } from '../../../src/store';
import { colors, radius } from '../../../src/theme';
import type { CycleIndex, LessonSession, Student } from '../../../src/types';
import { Button, Card, Field, Fold, Screen } from '../../../src/ui';

type DayRow = {
  student: Student;
  session: LessonSession;
  date: string;
  time: string;
};

type DayBlock = {
  date: string;
  items: DayRow[];
  holiday?: { reason: string };
};

function lessonDate(session: LessonSession) {
  return lessonDisplayDate(session);
}

function lessonTime(session: LessonSession) {
  return normalizeTime(session.makeup?.time || session.time || '');
}

function dateHeading(iso: string) {
  const d = parseIso(iso);
  return `${d.getMonth() + 1}월 ${d.getDate()}일 (${WEEKDAYS[d.getDay()]})`;
}

function hourLabel(time: string) {
  return formatTime12(time) || time;
}

function studentNameLabel(name: string) {
  const text = String(name || '').trim();
  if (!text) return text;
  return text.endsWith('님') ? text : `${text}님`;
}

function isAttended(session: LessonSession) {
  if (session.makeup) return session.makeup.status === 'done';
  return session.status === 'attended';
}

function isAbsent(session: LessonSession) {
  if (session.makeup) return session.makeup.status === 'absent';
  return session.status === 'absent';
}

function scheduleNote(student: Student, session: LessonSession) {
  if (session.makeup?.date) return '';
  const shown = normalizeTime(session.time);
  const fixed = normalizeTime(student.time);
  if (shown !== fixed) return '(당일 시간 변경)';
  return '';
}

function groupByDate(rows: DayRow[], newestFirst = false) {
  const map = new Map<string, DayRow[]>();
  for (const row of rows) {
    if (!row.date) continue;
    map.set(row.date, [...(map.get(row.date) ?? []), row]);
  }
  return [...map.entries()]
    .sort((a, b) => (newestFirst ? b[0].localeCompare(a[0]) : a[0].localeCompare(b[0])))
    .map(([date, items]) => ({
      date,
      items: items.sort(
        (a, b) =>
          (newestFirst ? b.time.localeCompare(a.time) : a.time.localeCompare(b.time)) ||
          a.student.name.localeCompare(b.student.name, 'ko')
      ),
    }));
}

function mergeDayBlocks(
  groups: { date: string; items: DayRow[] }[],
  holidays: { date: string; reason: string; past: boolean }[],
  pastSection: boolean
): DayBlock[] {
  const map = new Map<string, DayBlock>();
  for (const group of groups) map.set(group.date, { date: group.date, items: group.items });
  for (const holiday of holidays) {
    if (holiday.past !== pastSection) continue;
    map.set(holiday.date, { date: holiday.date, items: [], holiday: { reason: holiday.reason } });
  }
  return [...map.values()].sort((a, b) =>
    pastSection ? b.date.localeCompare(a.date) : a.date.localeCompare(b.date)
  );
}

export default function InstructorHome() {
  const { students, addStudent, setSessionStatus, setMakeupStatus, closures } = useStore();
  const router = useRouter();
  const [name, setName] = useState('');
  const [weekday, setWeekday] = useState(3);
  const [time, setTime] = useState('14:00');
  const [startCycle, setStartCycle] = useState<CycleIndex>(1);
  const [firstDate, setFirstDate] = useState('');
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const today = todayIso();

  const { upcoming, past, idle } = useMemo(() => {
    const upcomingRows: DayRow[] = [];
    const pastRows: DayRow[] = [];
    for (const student of students) {
      const split = splitSessionsAroundToday(student.sessions || [], today);
      for (const session of split.upcoming) {
        if (hideFromLessonCheck(session, closures)) continue;
        const date = lessonDate(session);
        if (!date) continue;
        upcomingRows.push({ student, session, date, time: lessonTime(session) });
      }
      for (const session of split.past) {
        if (hideFromLessonCheck(session, closures)) continue;
        const date = lessonDate(session);
        if (!date) continue;
        pastRows.push({ student, session, date, time: lessonTime(session) });
      }
    }
    const holidays = lessonCheckHolidayDays(closures, students, today);
    const scheduled = new Set(
      [...upcomingRows, ...pastRows].map((row) => row.student.id)
    );
    const idle = students.filter((student) => !scheduled.has(student.id));
    return {
      upcoming: mergeDayBlocks(groupByDate(upcomingRows), holidays, false),
      past: mergeDayBlocks(groupByDate(pastRows, true), holidays, true),
      idle,
    };
  }, [students, closures, today]);

  async function create() {
    setMessage('');
    if (!name.trim()) {
      setMessage('이름을 입력하세요.');
      return;
    }
    const student = await addStudent({
      name,
      weekday,
      time,
      startCycle,
      firstDate: firstDate || undefined,
    });
    setName('');
    setOpen(false);
    router.push({ pathname: '/(instructor)/student/[id]', params: { id: student.id } });
  }

  function openStudent(id: string) {
    router.push({ pathname: '/(instructor)/student/[id]', params: { id } });
  }

  async function toggleAttend(student: Student, session: LessonSession) {
    if (isHolidaySession(session)) return;
    if (session.makeup) {
      if (isAbsent(session) || isAttended(session)) {
        await setMakeupStatus(student.id, session.id, 'planned');
        return;
      }
      await setMakeupStatus(student.id, session.id, 'done');
      return;
    }
    if (isAbsent(session) || isAttended(session)) {
      await setSessionStatus(student.id, session.id, 'pending');
      return;
    }
    await setSessionStatus(student.id, session.id, 'attended');
  }

  function dateCard(date: string, items: DayRow[], pastDay = false, holiday?: { reason: string }) {
    const heading = `${date === today ? '오늘 · ' : ''}${dateHeading(date)}`;
    const list = holiday ? (
      <View
        style={{
          width: '100%',
          backgroundColor: colors.paper,
          borderRadius: radius.md,
          borderWidth: 1,
          borderColor: colors.line,
          paddingHorizontal: 16,
          paddingVertical: 12,
        }}
      >
        <Text style={{ color: colors.wine, fontSize: 16, fontWeight: '800' }}>
          {holiday.reason ? `휴강 · ${holiday.reason}` : '휴강'}
        </Text>
      </View>
    ) : (
      <View
        style={{
          width: '100%',
          backgroundColor: colors.paper,
          borderRadius: radius.md,
          borderWidth: 1,
          borderColor: colors.line,
          paddingHorizontal: 16,
          paddingVertical: 8,
        }}
      >
        {items.map((row) => {
          const makeup = Boolean(row.session.makeup?.date);
          const payNotes = lessonCheckPayNotes(row.student, row.session);
          const sameDayNote = makeup
            ? row.session.makeup!.date === row.session.date
              ? '(당일 시간 변경)'
              : ''
            : scheduleNote(row.student, row.session);
          const extraNote = [...payNotes, sameDayNote].filter(Boolean).join(' ');
          const done = isAttended(row.session);
          const missed = isAbsent(row.session);
          const holidayRow = isHolidaySession(row.session);
          const originalDate = row.session.date;
          const makeupTail = makeup
            ? `${originalDate ? parseIso(originalDate).getDate() : ''}일차 (${originalLessonStamp(originalDate)}) 보강`
            : '';
          const nameText = (
            <Text style={{ fontWeight: '800', color: colors.pine }}>{studentNameLabel(row.student.name)}</Text>
          );
          return (
            <View
              key={`${row.student.id}:${row.session.id}`}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 10,
                paddingVertical: 12,
                borderBottomWidth: 1,
                borderBottomColor: colors.ink,
              }}
            >
              {holidayRow ? (
                <View style={{ width: 22, height: 22, borderRadius: 4, backgroundColor: colors.wineSoft }} />
              ) : (
                <Pressable
                  onPress={() => toggleAttend(row.student, row.session)}
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: 4,
                    borderWidth: 2,
                    borderColor: missed ? colors.wine : done ? colors.pine : colors.ink,
                    backgroundColor: missed ? colors.wine : done ? colors.pine : colors.paper,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {missed ? (
                    <Text style={{ color: '#fff', fontWeight: '800', fontSize: 13, lineHeight: 16 }}>x</Text>
                  ) : done ? (
                    <Text style={{ color: '#fff', fontWeight: '800', fontSize: 14 }}>✓</Text>
                  ) : null}
                </Pressable>
              )}
              <Pressable onPress={() => openStudent(row.student.id)} style={{ flex: 1 }}>
                <Text style={{ color: colors.ink, fontSize: 16, fontWeight: '600' }}>
                  {hourLabel(row.time)} {nameText}
                  {` (${row.session.cycle}회)`}
                  {makeup ? ` ${makeupTail}` : ''}
                  {holidayRow ? ' 휴강' : missed ? ' 불참석' : ''}
                  {extraNote ? ` ${extraNote}` : ''}
                </Text>
              </Pressable>
            </View>
          );
        })}
      </View>
    );
    if (pastDay) {
      return (
        <Fold key={`past-${date}`} title={heading}>
          {list}
        </Fold>
      );
    }
    return (
      <View key={`up-${date}`} style={{ marginBottom: 12 }}>
        <View style={{ alignItems: 'center', marginBottom: 8 }}>
          <View
            style={{
              borderWidth: 1,
              borderColor: colors.ink,
              borderRadius: 999,
              paddingHorizontal: 16,
              paddingVertical: 6,
              backgroundColor: colors.paper,
              marginBottom: 12,
            }}
          >
            <Text style={{ fontWeight: '800', color: colors.ink }}>{heading}</Text>
          </View>
        </View>
        {list}
      </View>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
        <Screen title="레슨" subtitle="출석을 바로 체크할 수 있습니다. 이름을 누르면 상세로 갑니다.">
          <Button label={open ? '닫기' : '레슨생 추가'} onPress={() => setOpen(!open)} />
          {open ? (
            <Card>
              <Field label="이름" value={name} onChangeText={setName} placeholder="레슨생 이름" autoCapitalize="words" />
              <Text style={{ color: colors.muted, fontWeight: '600', marginBottom: 6 }}>고정 요일</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
                {WEEKDAYS.map((w, i) => (
                  <Pressable
                    key={w}
                    onPress={() => setWeekday(i)}
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
              <TimeField label="고정 시간" value={time} onChange={setTime} />
              <Text style={{ color: colors.muted, fontWeight: '600', marginBottom: 6 }}>시작 회차 (1~4)</Text>
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
                {([1, 2, 3, 4] as CycleIndex[]).map((n) => (
                  <Pressable
                    key={n}
                    onPress={() => setStartCycle(n)}
                    style={{
                      flex: 1,
                      paddingVertical: 10,
                      borderRadius: 10,
                      alignItems: 'center',
                      backgroundColor: startCycle === n ? colors.clay : colors.claySoft,
                    }}
                  >
                    <Text style={{ color: startCycle === n ? '#fff' : colors.clay, fontWeight: '800' }}>{n}</Text>
                  </Pressable>
                ))}
              </View>
              <DateField label="첫 레슨 날짜 (비우면 이번 주)" value={firstDate} onChange={setFirstDate} />
              {message ? <Text style={{ color: colors.wine, marginBottom: 8 }}>{message}</Text> : null}
              <Button label="4회 묶음으로 추가" onPress={create} tone="clay" />
            </Card>
          ) : null}

          {students.length === 0 ? (
            <Card>
              <Text style={{ color: colors.muted }}>아직 레슨생이 없습니다. 위에서 추가하세요.</Text>
            </Card>
          ) : null}

          {upcoming.map((group) => dateCard(group.date, group.items, false, group.holiday))}

          {idle.length > 0 ? (
            <View
              style={{
                backgroundColor: colors.paper,
                borderRadius: radius.md,
                borderWidth: 1,
                borderColor: colors.line,
                paddingHorizontal: 16,
                marginBottom: 12,
              }}
            >
              <Text style={{ fontWeight: '800', color: colors.ink, marginTop: 12, marginBottom: 4 }}>
                일정 없는 레슨생 ({idle.length})
              </Text>
              {idle.map((student) => (
                <Pressable
                  key={student.id}
                  onPress={() => openStudent(student.id)}
                  style={{
                    paddingVertical: 12,
                    borderBottomWidth: 1,
                    borderBottomColor: colors.ink,
                  }}
                >
                  <Text style={{ fontWeight: '800', color: colors.pine, fontSize: 16 }}>{studentNameLabel(student.name)}</Text>
                  {student.joinCode ? (
                    <Text style={{ color: colors.muted, fontWeight: '700', marginTop: 4 }}>가입코드 {student.joinCode}</Text>
                  ) : null}
                </Pressable>
              ))}
            </View>
          ) : null}

          {past.length > 0 ? (
            <Fold title={`지난 일정 (${past.reduce((n, group) => n + (group.holiday ? 1 : group.items.length), 0)})`}>
              {past.map((group) => dateCard(group.date, group.items, true, group.holiday))}
            </Fold>
          ) : null}
          <ScrollPad />
        </Screen>
      </ScrollView>
    </SafeAreaView>
  );
}
