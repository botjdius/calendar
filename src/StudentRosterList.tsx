import { useCallback, useRef, type ComponentType, type ReactNode } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import { formatTime12, formatWeekly, WEEKDAYS } from './schedule';
import { captureRosterContextMenu, rosterDeletePrompt } from './studentRoster';
import { colors, radius } from './theme';
import type { Student } from './types';
import { ConfirmBox } from './ui';

const WebDiv = 'div' as unknown as ComponentType<{
  onContextMenu?: (event: { preventDefault?: () => void; stopPropagation?: () => void }) => void;
  onClick?: () => void;
  onPointerDown?: (event: { button?: number; clientX?: number; clientY?: number }) => void;
  onPointerMove?: (event: { clientX?: number; clientY?: number }) => void;
  onPointerUp?: () => void;
  onPointerCancel?: () => void;
  onPointerLeave?: () => void;
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

function StudentName({ student, color }: { student: Student; color: string }) {
  const linked = Boolean(student.linkedUid);
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
      <Text style={{ fontWeight: '800', color, fontSize: 18 }}>{student.name}</Text>
      <View
        style={{
          paddingHorizontal: 8,
          paddingVertical: 3,
          borderRadius: 999,
          backgroundColor: linked ? colors.pineSoft : colors.line,
        }}
      >
        <Text
          style={{
            color: linked ? colors.pine : colors.muted,
            fontSize: 12,
            fontWeight: '800',
          }}
        >
          {linked ? '앱 등록' : '미등록'}
        </Text>
      </View>
    </View>
  );
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
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pressStart = useRef({ x: 0, y: 0 });
  const suppressClick = useRef(false);
  const cancelLongPress = useCallback(() => {
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
    longPressTimer.current = null;
  }, []);
  const startLongPress = useCallback(
    (event: { button?: number; clientX?: number; clientY?: number }) => {
      if (event.button !== undefined && event.button !== 0) return;
      cancelLongPress();
      suppressClick.current = false;
      pressStart.current = { x: event.clientX || 0, y: event.clientY || 0 };
      longPressTimer.current = setTimeout(() => {
        suppressClick.current = true;
        longPressTimer.current = null;
        onDelete();
      }, 500);
    },
    [cancelLongPress, onDelete]
  );
  const moveLongPress = useCallback(
    (event: { clientX?: number; clientY?: number }) => {
      if (
        Math.abs((event.clientX || 0) - pressStart.current.x) > 10 ||
        Math.abs((event.clientY || 0) - pressStart.current.y) > 10
      ) {
        cancelLongPress();
      }
    },
    [cancelLongPress]
  );
  const handleContext = useCallback(
    (event: { preventDefault?: () => void; stopPropagation?: () => void }) => {
      captureRosterContextMenu(event);
      cancelLongPress();
      onDelete();
    },
    [cancelLongPress, onDelete]
  );
  const nameColor = selected ? colors.wine : colors.pine;

  if (Platform.OS === 'web') {
    return (
      <WebDiv
        onContextMenu={handleContext}
        onPointerDown={startLongPress}
        onPointerMove={moveLongPress}
        onPointerUp={cancelLongPress}
        onPointerCancel={cancelLongPress}
        onPointerLeave={cancelLongPress}
        onClick={() => {
          if (suppressClick.current) {
            suppressClick.current = false;
            return;
          }
          onOpen();
        }}
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
          touchAction: 'pan-y',
        }}
      >
        <StudentName student={student} color={nameColor} />
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
      <StudentName student={student} color={nameColor} />
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
