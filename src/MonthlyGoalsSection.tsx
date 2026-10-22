import { useEffect, useMemo, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
} from 'react-native-reanimated';
import {
  currentMonthKey,
  monthKeyLabel,
  monthlyGoalsProgress,
  newMonthlyGoalItem,
  nextMonthKey,
  prepareMonthlyGoals,
  previousMonthKey,
  removeMonthlyGoalItem,
  toggleMonthlyGoalItem,
  updateMonthlyGoalItems,
} from './monthlyGoals';
import { colors, radius } from './theme';
import { useStore } from './store';
import type { MonthlyGoalItem, MonthlyGoalsStore, Student } from './types';
import { Button, Card } from './ui';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type Props = {
  student: Student;
  disabled?: boolean;
};

function GoalRow({
  item,
  disabled,
  onToggle,
  onEdit,
}: {
  item: MonthlyGoalItem;
  disabled?: boolean;
  onToggle: (checked: boolean) => void;
  onEdit: (text: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(item.text);
  const scale = useSharedValue(1);
  const checkScale = useSharedValue(item.checked ? 1 : 0.85);

  useEffect(() => {
    checkScale.value = withSpring(item.checked ? 1 : 0.85, { damping: 14, stiffness: 220 });
  }, [item.checked, checkScale]);

  useEffect(() => {
    if (!editing) setDraft(item.text);
  }, [item.text, editing]);

  const rowStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const boxStyle = useAnimatedStyle(() => ({
    transform: [{ scale: checkScale.value }],
  }));

  return (
    <View style={{ gap: 8 }}>
      <AnimatedPressable
        onPress={() => {
          if (disabled || editing) return;
          scale.value = withSequence(withSpring(0.97, { damping: 16 }), withSpring(1, { damping: 12 }));
          onToggle(!item.checked);
        }}
        disabled={disabled || editing}
        style={[
          {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            paddingVertical: 14,
            paddingHorizontal: 14,
            minHeight: 52,
            backgroundColor: colors.paper,
            borderRadius: radius.md,
            borderWidth: 1,
            borderColor: item.checked ? colors.mossSoft : colors.line,
          },
          rowStyle,
        ]}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: item.checked }}
      >
        <Animated.View
          style={[
            {
              width: 28,
              height: 28,
              borderRadius: 8,
              borderWidth: 2,
              borderColor: item.checked ? colors.moss : colors.muted,
              backgroundColor: item.checked ? colors.mossSoft : 'transparent',
              alignItems: 'center',
              justifyContent: 'center',
            },
            boxStyle,
          ]}
        >
          {item.checked ? <Text style={{ color: colors.moss, fontWeight: '900', fontSize: 16 }}>✓</Text> : null}
        </Animated.View>
        {editing ? (
          <TextInput
            value={draft}
            onChangeText={setDraft}
            style={{
              flex: 1,
              fontSize: 16,
              lineHeight: 22,
              fontWeight: '700',
              color: colors.ink,
              paddingVertical: 0,
            }}
            autoFocus
            onBlur={() => {
              setEditing(false);
              const text = draft.trim();
              if (text && text !== item.text) onEdit(text);
            }}
            onSubmitEditing={() => {
              setEditing(false);
              const text = draft.trim();
              if (text && text !== item.text) onEdit(text);
            }}
          />
        ) : (
          <Pressable
            style={{ flex: 1 }}
            onPress={() => {
              if (disabled) return;
              setEditing(true);
            }}
            disabled={disabled}
          >
            <Text
              style={{
                fontSize: 16,
                lineHeight: 22,
                fontWeight: item.checked ? '600' : '700',
                color: item.checked ? colors.muted : colors.ink,
                textDecorationLine: item.checked ? 'line-through' : 'none',
              }}
            >
              {item.text}
            </Text>
          </Pressable>
        )}
      </AnimatedPressable>
    </View>
  );
}

export function MonthlyGoalsSection({ student, disabled }: Props) {
  const { saveMonthlyGoals } = useStore();
  const [monthKey, setMonthKey] = useState(currentMonthKey());
  const [newText, setNewText] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const prepared = useMemo(
    () => prepareMonthlyGoals(student.monthlyGoals, monthKey, student.removedMonthlyGoalIds),
    [student.monthlyGoals, student.removedMonthlyGoalIds, monthKey]
  );
  const items = prepared.monthItems;
  const progress = monthlyGoalsProgress(items);

  useEffect(() => {
    if (!prepared.changed || disabled) return;
    void saveMonthlyGoals(student.id, prepared.store, student.removedMonthlyGoalIds).catch(() => {});
  }, [prepared.changed, prepared.store, disabled, saveMonthlyGoals, student.id, student.removedMonthlyGoalIds]);

  async function persist(store: MonthlyGoalsStore, removedMonthlyGoalIds?: string[]) {
    setError('');
    setSaving(true);
    try {
      await saveMonthlyGoals(
        student.id,
        store,
        removedMonthlyGoalIds ?? student.removedMonthlyGoalIds
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : '저장하지 못했습니다.');
    } finally {
      setSaving(false);
    }
  }

  async function addGoal() {
    const text = newText.trim();
    if (!text) return;
    const base = prepareMonthlyGoals(student.monthlyGoals, monthKey, student.removedMonthlyGoalIds).store;
    const list = [...(base[monthKey] || []), newMonthlyGoalItem(text, monthKey)];
    setNewText('');
    await persist(
      updateMonthlyGoalItems(base, monthKey, list, student.removedMonthlyGoalIds),
      student.removedMonthlyGoalIds
    );
  }

  async function toggleItem(itemId: string, checked: boolean) {
    const base = prepareMonthlyGoals(student.monthlyGoals, monthKey, student.removedMonthlyGoalIds).store;
    await persist(
      toggleMonthlyGoalItem(base, monthKey, itemId, checked, student.removedMonthlyGoalIds),
      student.removedMonthlyGoalIds
    );
  }

  async function editItem(itemId: string, text: string) {
    const stamp = new Date().toISOString();
    const base = prepareMonthlyGoals(student.monthlyGoals, monthKey, student.removedMonthlyGoalIds).store;
    const list = (base[monthKey] || []).map((item) =>
      item.id === itemId ? { ...item, text, updatedAt: stamp } : item
    );
    await persist(
      updateMonthlyGoalItems(base, monthKey, list, student.removedMonthlyGoalIds),
      student.removedMonthlyGoalIds
    );
  }

  async function removeItem(itemId: string) {
    const base = prepareMonthlyGoals(student.monthlyGoals, monthKey, student.removedMonthlyGoalIds).store;
    const removed = removeMonthlyGoalItem(base, itemId, student.removedMonthlyGoalIds);
    await persist(removed.store, removed.removedMonthlyGoalIds);
  }

  return (
    <Card>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <Text style={{ color: colors.pine, fontSize: 18, fontWeight: '900' }}>한달 목표</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Button tone="ghost" label="◀" disabled={saving} onPress={() => setMonthKey(previousMonthKey(monthKey))} />
          <Text style={{ fontWeight: '800', color: colors.ink, minWidth: 88, textAlign: 'center' }}>
            {monthKeyLabel(monthKey)}
          </Text>
          <Button
            tone="ghost"
            label="▶"
            disabled={saving || monthKey >= currentMonthKey()}
            onPress={() => setMonthKey(nextMonthKey(monthKey))}
          />
        </View>
      </View>
      <Text style={{ color: colors.muted, marginTop: 6, lineHeight: 20 }}>
        지난달에 체크하지 않은 목표는 다음 달 목록으로 자동 이어집니다.
      </Text>
      {items.length > 0 ? (
        <Text style={{ color: colors.pine, fontWeight: '800', fontSize: 15, marginTop: 10 }}>
          {progress.done}/{progress.total} 완료
        </Text>
      ) : null}
      <View style={{ gap: 10, marginTop: 12 }}>
        {items.map((item) => (
          <View key={item.id}>
            <GoalRow
              item={item}
              disabled={disabled || saving}
              onToggle={(checked) => void toggleItem(item.id, checked)}
              onEdit={(text) => void editItem(item.id, text)}
            />
            {!disabled ? (
              <Pressable onPress={() => void removeItem(item.id)} style={{ alignSelf: 'flex-end', marginTop: 4 }}>
                <Text style={{ color: colors.wine, fontWeight: '700', fontSize: 13 }}>삭제</Text>
              </Pressable>
            ) : null}
          </View>
        ))}
      </View>
      {!disabled ? (
        <View style={{ marginTop: 14, gap: 8 }}>
          <TextInput
            value={newText}
            onChangeText={setNewText}
            placeholder="이번 달 목표 추가"
            placeholderTextColor={colors.muted}
            style={{
              borderWidth: 1,
              borderColor: colors.line,
              borderRadius: radius.md,
              paddingHorizontal: 14,
              paddingVertical: 12,
              fontSize: 16,
              backgroundColor: colors.paper,
              color: colors.ink,
            }}
            onSubmitEditing={() => void addGoal()}
            editable={!saving}
          />
          <Button tone="clay" label={saving ? '저장 중…' : '목표 추가'} disabled={saving || !newText.trim()} onPress={() => void addGoal()} />
        </View>
      ) : null}
      {error ? <Text style={{ color: colors.wine, fontWeight: '700', marginTop: 10 }}>{error}</Text> : null}
    </Card>
  );
}
