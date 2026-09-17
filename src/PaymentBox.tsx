import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { DateField, timeLabel } from './MonthCal';
import { paymentBoxesForSession, todayIso } from './schedule';
import { colors } from './theme';
import type { LessonSession, Student } from './types';
import { Button } from './ui';

export function PaymentBox({
  student,
  session,
  packs,
  onToggle,
}: {
  student: Student;
  session?: LessonSession;
  packs?: number[];
  onToggle: (pack: number, paid: boolean, paidAt?: string, sessionId?: string) => void;
}) {
  const boxes = packs
    ? packs.map((pack) => student.payments?.find((p) => p.pack === pack) ?? { pack, paid: false })
    : session
      ? paymentBoxesForSession(student, session)
      : [];
  const [dates, setDates] = useState<Record<number, string>>({});
  const [openPack, setOpenPack] = useState<number | null>(null);
  if (!boxes.length) return null;

  return (
    <View>
      {boxes.map((p) => {
        const date = dates[p.pack] || p.paidAt || todayIso();
        const open = openPack === p.pack;
        return (
          <View key={p.pack}>
            <Pressable onPress={() => setOpenPack(open ? null : p.pack)}>
              <Text
                style={{ color: p.paid ? colors.moss : colors.wine, fontWeight: '800', marginTop: 6 }}
              >
                {p.paid ? `결제 ${p.paidAt ? timeLabel(p.paidAt) : ''}` : '미결제'}
              </Text>
            </Pressable>
            {open ? (
              <View style={{ marginTop: 8 }}>
                <DateField
                  defaultOpen
                  label="결제일"
                  value={date}
                  onChange={(iso) => {
                    setDates((prev) => ({ ...prev, [p.pack]: iso }));
                    onToggle(p.pack, true, iso, session?.id);
                    setOpenPack(null);
                  }}
                />
                {p.paid ? (
                  <Button
                    tone="wine"
                    label="미결제로 변경"
                    onPress={() => {
                      onToggle(p.pack, false, undefined, session?.id);
                      setOpenPack(null);
                    }}
                  />
                ) : null}
              </View>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

export function PaymentPillLabel(badge: 'none' | 'paid' | 'unpaid') {
  if (badge === 'paid') return { label: '결제', tone: 'moss' as const };
  if (badge === 'unpaid') return { label: '미결제', tone: 'wine' as const };
  return null;
}
