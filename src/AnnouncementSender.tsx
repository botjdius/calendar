import { useMemo, useState } from 'react';
import { Alert, Platform, Pressable, Text, View } from 'react-native';
import { DateField } from './MonthCal';
import { todayIso, WEEKDAYS } from './schedule';
import { useStore } from './store';
import { colors, radius } from './theme';
import type { Student } from './types';
import { Button, Field, Fold } from './ui';

type TargetMode = 'all' | 'selected';

export function AnnouncementSender({ students }: { students: Student[] }) {
  const { announcements, sendAnnouncement, removeAnnouncement } = useStore();
  const registered = useMemo(() => students.filter((student) => Boolean(student.linkedUid)), [students]);
  const registeredIds = useMemo(() => new Set(registered.map((student) => student.id)), [registered]);
  const groupedStudents = useMemo(() => {
    const weekdayOrder = [1, 2, 3, 4, 5, 6, 0];
    return weekdayOrder
      .map((weekday) => ({
        weekday,
        students: students
          .filter((student) => student.weekday === weekday)
          .sort((a, b) => a.time.localeCompare(b.time) || a.name.localeCompare(b.name, 'ko')),
      }))
      .filter((group) => group.students.length);
  }, [students]);
  const [mode, setMode] = useState<TargetMode>('all');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [title, setTitle] = useState('쟝쟝 공지사항');
  const [body, setBody] = useState('');
  const [expiresOn, setExpiresOn] = useState(todayIso());
  const [sending, setSending] = useState(false);
  const [deletingId, setDeletingId] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const targets =
    mode === 'all'
      ? students
      : registered.filter((student) => selectedIds.includes(student.id));

  function toggleStudent(id: string) {
    if (!registeredIds.has(id)) return;
    setSelectedIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
    );
    setMessage('');
    setError('');
  }

  async function send() {
    const cleanTitle = title.trim() || '쟝쟝 공지사항';
    const cleanBody = body.trim();
    if (!cleanBody) {
      setError('공지 내용을 입력해 주세요.');
      return;
    }
    if (!targets.length) {
      setError(
        mode === 'all'
          ? '알림을 받을 수 있는 앱 등록 레슨생이 없습니다.'
          : '공지사항을 받을 레슨생을 선택해 주세요.'
      );
      return;
    }
    setSending(true);
    setMessage('');
    setError('');
    try {
      const sent = await sendAnnouncement({
        title: cleanTitle,
        body: cleanBody,
        studentIds: targets.map((student) => student.id),
        expiresOn,
      });
      setMessage(
        sent > 0
          ? `${targets.length}명 앱에 저장 · ${sent}개 기기에 알림을 보냈습니다.`
          : `${targets.length}명 앱에 저장했습니다. 알림을 켜지 않은 기기에는 배너가 표시되지 않습니다.`
      );
      setBody('');
    } catch (err) {
      setError(err instanceof Error ? err.message : '공지사항을 보내지 못했습니다.');
    } finally {
      setSending(false);
    }
  }

  function askDelete(id: string, titleText: string) {
    const remove = async () => {
      if (deletingId) return;
      setDeletingId(id);
      setError('');
      try {
        await removeAnnouncement(id);
        setMessage('공지사항을 삭제했습니다.');
      } catch (err) {
        setError(err instanceof Error ? err.message : '공지사항을 삭제하지 못했습니다.');
      } finally {
        setDeletingId('');
      }
    };
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.confirm(`"${titleText}" 공지사항을 삭제할까요?`)) void remove();
      return;
    }
    Alert.alert('공지사항 삭제', `"${titleText}" 공지사항을 삭제할까요?`, [
      { text: '취소', style: 'cancel' },
      { text: '삭제', style: 'destructive', onPress: () => void remove() },
    ]);
  }

  return (
    <Fold title="공지사항 보내기">
      <Text style={{ color: colors.muted, fontWeight: '700', lineHeight: 22, marginBottom: 10 }}>
        앱에 등록하고 알림을 켠 레슨생에게 푸시 공지를 보냅니다.
      </Text>
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
        {([
          ['all', `전체 (${students.length}명)`],
          ['selected', `직접 선택 (${selectedIds.length}명)`],
        ] as const).map(([value, label]) => {
          const active = mode === value;
          return (
            <Pressable
              key={value}
              onPress={() => {
                setMode(value);
                setMessage('');
                setError('');
              }}
              style={{
                flex: 1,
                borderWidth: 1,
                borderColor: active ? colors.pine : colors.line,
                backgroundColor: active ? colors.pineSoft : '#fff',
                borderRadius: radius.md,
                paddingVertical: 11,
                alignItems: 'center',
              }}
            >
              <Text style={{ color: active ? colors.pine : colors.muted, fontWeight: '800' }}>{label}</Text>
            </Pressable>
          );
        })}
      </View>

      {mode === 'selected' ? (
        <View style={{ marginBottom: 12 }}>
          {groupedStudents.map((group) => (
            <View key={group.weekday} style={{ marginBottom: 10 }}>
              <Text style={{ color: colors.clay, fontSize: 16, fontWeight: '900', marginTop: 4 }}>
                {WEEKDAYS[group.weekday]}요일
              </Text>
              {group.students.map((student) => {
                const enabled = registeredIds.has(student.id);
                const selected = selectedIds.includes(student.id);
                return (
                  <Pressable
                    key={student.id}
                    disabled={!enabled}
                    onPress={() => toggleStudent(student.id)}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 10,
                      paddingVertical: 10,
                      borderBottomWidth: 1,
                      borderBottomColor: colors.line,
                      opacity: enabled ? 1 : 0.45,
                    }}
                  >
                    <View
                      style={{
                        width: 22,
                        height: 22,
                        borderRadius: 6,
                        borderWidth: 2,
                        borderColor: selected ? colors.pine : colors.line,
                        backgroundColor: selected ? colors.pine : '#fff',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Text style={{ color: '#fff', fontWeight: '900' }}>{selected ? '✓' : ''}</Text>
                    </View>
                    <Text style={{ flex: 1, color: colors.ink, fontWeight: '800' }}>{student.name}</Text>
                    <Text style={{ color: enabled ? colors.moss : colors.muted, fontWeight: '700', fontSize: 12 }}>
                      {enabled ? '앱 등록' : '미등록'}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          ))}
        </View>
      ) : null}

      <Field
        label="공지 제목"
        value={title}
        onChangeText={setTitle}
        placeholder="공지사항 제목"
        autoCapitalize="sentences"
      />
      <Field
        label="공지 내용"
        value={body}
        onChangeText={(value) => {
          setBody(value);
          setMessage('');
          setError('');
        }}
        placeholder="레슨생에게 보낼 내용을 입력하세요."
        autoCapitalize="sentences"
        multiline
        minHeight={110}
      />
      <DateField
        label="공지 표시 종료일 (이 날짜까지 표시)"
        value={expiresOn}
        onChange={setExpiresOn}
      />
      {error ? <Text style={{ color: colors.wine, fontWeight: '700', marginBottom: 10 }}>{error}</Text> : null}
      {message ? <Text style={{ color: colors.moss, fontWeight: '800', marginBottom: 10 }}>{message}</Text> : null}
      <Button
        label={sending ? '전송 중' : `${targets.length}명에게 공지 보내기`}
        disabled={sending}
        onPress={() => void send()}
      />
      {announcements.length > 0 ? (
        <View style={{ marginTop: 18 }}>
          <Text style={{ color: colors.ink, fontSize: 16, fontWeight: '900', marginBottom: 6 }}>
            보낸 공지
          </Text>
          {[...announcements]
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
            .map((item) => (
              <View
                key={item.id}
                style={{
                  paddingVertical: 12,
                  borderBottomWidth: 1,
                  borderBottomColor: colors.line,
                }}
              >
                <Text style={{ color: colors.ink, fontWeight: '900' }}>{item.title}</Text>
                <Text style={{ color: colors.muted, marginTop: 4, lineHeight: 20 }}>{item.body}</Text>
                <Text style={{ color: colors.muted, fontSize: 12, marginTop: 6 }}>
                  {item.studentIds.length}명 · {item.expiresOn || item.createdAt.slice(0, 10)}까지 표시
                </Text>
                <View style={{ marginTop: 8 }}>
                  <Button
                    tone="wine"
                    label={deletingId === item.id ? '삭제 중' : '공지 삭제'}
                    disabled={Boolean(deletingId)}
                    onPress={() => askDelete(item.id, item.title)}
                  />
                </View>
              </View>
            ))}
        </View>
      ) : null}
    </Fold>
  );
}
