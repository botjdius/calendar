import { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { addDays, formatTime12, normalizeTime, pad, parseIso, toIso, WEEKDAYS } from './schedule';
import { colors, radius } from './theme';

export type CalMark = 'closure' | 'slot' | 'lesson' | 'makeup';

function monthGrid(year: number, month: number) {
  const first = new Date(year, month, 1);
  const start = new Date(first);
  start.setDate(1 - first.getDay());
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
}

export function MonthCal({
  marks,
  selected,
  onSelect,
  editable,
}: {
  marks?: Record<string, CalMark[]>;
  selected?: string;
  onSelect?: (iso: string) => void;
  editable?: boolean;
}) {
  const today = toIso(new Date());
  const seed = selected ? parseIso(selected) : new Date();
  const [cursor, setCursor] = useState({ y: seed.getFullYear(), m: seed.getMonth() });
  const days = useMemo(() => monthGrid(cursor.y, cursor.m), [cursor]);

  return (
    <View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <Pressable onPress={() => setCursor((c) => ({ y: c.m === 0 ? c.y - 1 : c.y, m: c.m === 0 ? 11 : c.m - 1 }))}>
          <Text style={{ fontWeight: '800', color: colors.pine, fontSize: 16 }}>‹</Text>
        </Pressable>
        <Text style={{ fontWeight: '800', fontSize: 16, color: colors.ink }}>
          {cursor.y}년 {cursor.m + 1}월
        </Text>
        <Pressable onPress={() => setCursor((c) => ({ y: c.m === 11 ? c.y + 1 : c.y, m: c.m === 11 ? 0 : c.m + 1 }))}>
          <Text style={{ fontWeight: '800', color: colors.pine, fontSize: 16 }}>›</Text>
        </Pressable>
      </View>
      <View style={{ flexDirection: 'row' }}>
        {WEEKDAYS.map((w) => (
          <Text key={w} style={{ flex: 1, textAlign: 'center', color: colors.muted, fontSize: 12, fontWeight: '700' }}>
            {w}
          </Text>
        ))}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 4 }}>
        {days.map((d) => {
          const iso = toIso(d);
          const inMonth = d.getMonth() === cursor.m;
          const kinds = marks?.[iso] ?? [];
          const isSel = selected === iso;
          return (
            <Pressable
              key={iso}
              onPress={() => onSelect?.(iso)}
              style={{
                width: '14.28%',
                height: 44,
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: radius.sm,
                backgroundColor: isSel ? colors.pineSoft : 'transparent',
              }}
            >
              <Text
                style={{
                  fontWeight: iso === today ? '800' : '600',
                  color: inMonth ? colors.ink : colors.line,
                }}
              >
                {d.getDate()}
              </Text>
              <View style={{ flexDirection: 'row', gap: 2, height: 6, marginTop: 2 }}>
                {kinds.slice(0, 3).map((k) => (
                  <View
                    key={k}
                    style={{
                      width: 5,
                      height: 5,
                      borderRadius: 3,
                      backgroundColor: k === 'closure' ? colors.wine : k === 'slot' ? colors.moss : k === 'makeup' ? colors.blue : colors.pine,
                    }}
                  />
                ))}
              </View>
            </Pressable>
          );
        })}
      </View>
      {editable ? (
        <Text style={{ color: colors.muted, fontSize: 12, marginTop: 6 }}>날짜를 눌러 선택합니다.</Text>
      ) : null}
    </View>
  );
}

export function DateField({
  label,
  value,
  onChange,
  marks,
  defaultOpen = false,
}: {
  label: string;
  value: string;
  onChange: (iso: string) => void;
  marks?: Record<string, CalMark[]>;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={{ color: colors.muted, fontSize: 13, marginBottom: 6, fontWeight: '600' }}>{label}</Text>
      <Pressable
        onPress={() => setOpen(!open)}
        style={{
          backgroundColor: '#fff',
          borderWidth: 1,
          borderColor: colors.line,
          borderRadius: radius.sm,
          paddingHorizontal: 12,
          paddingVertical: 12,
        }}
      >
        <Text style={{ color: value ? colors.ink : colors.muted, fontSize: 16 }}>{value || '달력에서 날짜 선택'}</Text>
      </Pressable>
      {open ? (
        <View style={{ marginTop: 8 }}>
          <MonthCal
            selected={value || undefined}
            marks={marks}
            editable
            onSelect={(iso) => {
              onChange(iso);
              setOpen(false);
            }}
          />
          {value ? (
            <Pressable onPress={() => onChange(addDays(value, 7))} style={{ marginTop: 6 }}>
              <Text style={{ color: colors.pine, fontWeight: '700' }}>+7일 (다음 주)</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

export function timeLabel(iso: string) {
  if (!iso) return '';
  const d = parseIso(iso);
  return `${d.getMonth() + 1}/${d.getDate()}(${WEEKDAYS[d.getDay()]})`;
}

const HOURS12 = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const MINUTES = ['00', '10', '20', '30', '40', '50'];

export function TimeField({
  label,
  value,
  onChange,
  allowEmpty,
}: {
  label: string;
  value: string;
  onChange: (hhmm: string) => void;
  allowEmpty?: boolean;
}) {
  const empty = allowEmpty && !String(value || '').trim();
  const hhmm = empty ? '' : normalizeTime(value || '14:00');
  const [hs, ms] = (hhmm || '14:00').split(':');
  const hour24 = Number(hs);
  const pm = hour24 >= 12;
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  const mins = MINUTES.includes(ms) ? MINUTES : [...MINUTES, ms].sort();

  function commit(nextPm: boolean, nextHour12: number, nextMin: string) {
    let hour = nextHour12 % 12;
    if (nextPm) hour += 12;
    onChange(`${pad(hour)}:${nextMin}`);
  }

  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={{ color: colors.muted, fontSize: 13, marginBottom: 6, fontWeight: '600' }}>{label}</Text>
      <Text style={{ color: colors.ink, fontWeight: '800', fontSize: 16, marginBottom: 8 }}>
        {empty ? '종일' : formatTime12(hhmm)}
      </Text>
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
        {allowEmpty ? (
          <Pressable
            onPress={() => onChange('')}
            style={{
              paddingHorizontal: 12,
              paddingVertical: 8,
              borderRadius: 10,
              backgroundColor: empty ? colors.pine : colors.pineSoft,
            }}
          >
            <Text style={{ color: empty ? '#fff' : colors.pine, fontWeight: '800' }}>종일</Text>
          </Pressable>
        ) : null}
        {(['오전', '오후'] as const).map((label12, idx) => {
          const isPm = idx === 1;
          const on = !empty && pm === isPm;
          return (
            <Pressable
              key={label12}
              onPress={() => commit(isPm, hour12, ms)}
              style={{
                paddingHorizontal: 14,
                paddingVertical: 8,
                borderRadius: 10,
                backgroundColor: on ? colors.pine : colors.pineSoft,
              }}
            >
              <Text style={{ color: on ? '#fff' : colors.pine, fontWeight: '800' }}>{label12}</Text>
            </Pressable>
          );
        })}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
        {HOURS12.map((h) => {
          const on = !empty && hour12 === h;
          return (
            <Pressable
              key={h}
              onPress={() => commit(pm, h, ms)}
              style={{
                minWidth: 44,
                paddingVertical: 8,
                borderRadius: 10,
                alignItems: 'center',
                backgroundColor: on ? colors.clay : colors.paper,
                borderWidth: 1,
                borderColor: on ? colors.clay : colors.line,
              }}
            >
              <Text style={{ color: on ? '#fff' : colors.ink, fontWeight: '800' }}>{h}</Text>
            </Pressable>
          );
        })}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {mins.map((m) => {
          const on = !empty && ms === m;
          return (
            <Pressable
              key={m}
              onPress={() => commit(pm, hour12, m)}
              style={{
                minWidth: 44,
                paddingVertical: 8,
                borderRadius: 10,
                alignItems: 'center',
                backgroundColor: on ? colors.clay : colors.paper,
                borderWidth: 1,
                borderColor: on ? colors.clay : colors.line,
              }}
            >
              <Text style={{ color: on ? '#fff' : colors.ink, fontWeight: '800' }}>{m}분</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export { pad };
