import { useCallback, type ComponentType, type ReactNode } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import { formatTime12, formatWeekly, WEEKDAYS } from './schedule';
import { captureRosterContextMenu, rosterDeletePrompt } from './studentRoster';
import { colors, radius } from './theme';
import type { Student } from './types';
import { ConfirmBox } from './ui';

const WebDiv = 'div' as unknown as ComponentType<{
  onContextMenu?: (event: { preventDefault?: () => void; stopPropagation?: () => void }) => void;
  onClick?: () => void;
  style?: Record<string, string | number>;
  children?: ReactNode;
}>;

function groupStudents(students: Student[]) {
  const sorted = [...students].sort((a, b) => {
    const day = (Number.isInteger(a.weekday) ? a.weekday : 7) - (Number.isInteger(b.weekday) ? b.weekday : 7);
    if (day) return day;
    return String(a.time || '').localeCompare(String(b.time || '')) || a.name.localeCompare(b.name, 'ko');
  });
  const byDay: { weekday: number; label: string; items: Student[] }[] = [];
  for (const student of sorted) {
    const weekday = Number.isInteger(student.weekday) ? student.weekday : -1;
    const last = byDay[byDay.length - 1];
    if (!last || last.weekday !== weekday) {
      byDay.push({
        weekday,
        label: weekday >= 0 ? `${WEEKDAYS[weekday]}요일` : '요일 미정',
        items: [student],
      });
    } else {
      last.items.push(student);
    }
  }
  return byDay;
}

function RosterRow({
  student,
  selected,
  last,
  onOpen,
  onDelete,
}: {
  student: Student;
  selected: boolean;
  last: boolean;
  onOpen: () => void;
  onDelete: () => void;
}) {
  const meta = formatWeekly(student.weekday, student.time) || formatTime12(student.time) || '시간 미정';
  const handleContext = useCallback(
    (event: { preventDefault?: () => void; stopPropagation?: () => void }) => {
      captureRosterContextMenu(event);
      onDelete();
    },
    [onDelete]
  );
  const nameColor = selected ? colors.wine : colors.pine;

  if (Platform.OS === 'web') {
    return (
      <WebDiv
        onContextMenu={handleContext}
        onClick={onOpen}
        style={{
          paddingTop: 14,
          paddingBottom: 14,
          paddingLeft: 16,
          paddingRight: 16,
          borderBottom: last ? 'none' : `1px solid ${colors.ink}`,
          backgroundColor: selected ? colors.wineSoft : 'transparent',
          cursor: 'pointer',
          userSelect: 'none',
          WebkitUserSelect: 'none',
        }}
      >
        <Text style={{ fontWeight: '800', color: nameColor, fontSize: 18 }}>{student.name}</Text>
        <Text style={{ color: colors.muted, fontWeight: '700', marginTop: 4 }}>{meta}</Text>
      </WebDiv>
    );
  }

  return (
    <Pressable
      onPress={onOpen}
      onLongPress={onDelete}
      delayLongPress={350}
      style={{
        paddingVertical: 14,
        paddingHorizontal: 16,
        borderBottomWidth: last ? 0 : 1,
        borderBottomColor: colors.ink,
        backgroundColor: selected ? colors.wineSoft : 'transparent',
      }}
    >
      <Text style={{ fontWeight: '800', color: nameColor, fontSize: 18 }}>{student.name}</Text>
      <Text style={{ color: colors.muted, fontWeight: '700', marginTop: 4 }}>{meta}</Text>
    </Pressable>
  );
}

export function StudentRosterList({
  students,
  askDelete,
  busy,
  error,
  onOpen,
  onAskDelete,
  onCancel,
  onConfirm,
}: {
  students: Student[];
  askDelete: Student | null;
  busy: boolean;
  error: string;
  onOpen: (id: string) => void;
  onAskDelete: (student: Student) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const groups = groupStudents(students);
  const prompt = askDelete ? rosterDeletePrompt(askDelete) : null;

  return (
    <>
      {prompt ? (
        <ConfirmBox
          title={prompt.title}
          message={busy ? '삭제 중…' : error || prompt.message}
          confirmLabel={busy ? '삭제 중' : prompt.confirmLabel}
          onCancel={() => {
            if (!busy) onCancel();
          }}
          onConfirm={() => {
            if (!busy) onConfirm();
          }}
        />
      ) : null}
      {groups.length === 0 ? (
        <View
          style={{
            backgroundColor: colors.paper,
            borderRadius: radius.md,
            borderWidth: 1,
            borderColor: colors.line,
            padding: 16,
            marginTop: 8,
          }}
        >
          <Text style={{ color: colors.muted, fontWeight: '700' }}>아직 등록된 레슨생이 없습니다.</Text>
        </View>
      ) : (
        groups.map((group) => (
          <View key={group.label} style={{ marginTop: 12 }}>
            <Text style={{ fontWeight: '800', fontSize: 15, color: colors.muted, marginBottom: 8 }}>{group.label}</Text>
            <View
              style={{
                backgroundColor: colors.paper,
                borderRadius: radius.md,
                borderWidth: 1,
                borderColor: colors.line,
                overflow: 'hidden',
              }}
            >
              {group.items.map((student, index) => (
                <RosterRow
                  key={student.id}
                  student={student}
                  selected={askDelete?.id === student.id}
                  last={index === group.items.length - 1}
                  onOpen={() => onOpen(student.id)}
                  onDelete={() => onAskDelete(student)}
                />
              ))}
            </View>
          </View>
        ))
      )}
    </>
  );
}
