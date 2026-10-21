import { useEffect } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
} from 'react-native-reanimated';
import { lessonChecklistItems, lessonChecklistProgress } from './lessonChecklist';
import { colors, radius } from './theme';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type Props = {
  note: string;
  checkedIds: string[];
  onToggleItem: (itemId: string, checked: boolean) => void;
  disabled?: boolean;
};

function ChecklistRow({
  itemId,
  label,
  checked,
  onToggle,
  disabled,
}: {
  itemId: string;
  label: string;
  checked: boolean;
  onToggle: (checked: boolean) => void;
  disabled?: boolean;
}) {
  const scale = useSharedValue(1);
  const checkScale = useSharedValue(checked ? 1 : 0.85);

  useEffect(() => {
    checkScale.value = withSpring(checked ? 1 : 0.85, { damping: 14, stiffness: 220 });
  }, [checked, checkScale]);

  const rowStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const boxStyle = useAnimatedStyle(() => ({
    transform: [{ scale: checkScale.value }],
  }));

  return (
    <AnimatedPressable
      onPress={() => {
        if (disabled) return;
        scale.value = withSequence(withSpring(0.97, { damping: 16 }), withSpring(1, { damping: 12 }));
        onToggle(!checked);
      }}
      disabled={disabled}
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
          borderColor: checked ? colors.mossSoft : colors.line,
        },
        rowStyle,
      ]}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={label}
    >
      <Animated.View
        style={[
          {
            width: 28,
            height: 28,
            borderRadius: 8,
            borderWidth: 2,
            borderColor: checked ? colors.moss : colors.muted,
            backgroundColor: checked ? colors.mossSoft : 'transparent',
            alignItems: 'center',
            justifyContent: 'center',
          },
          boxStyle,
        ]}
      >
        {checked ? <Text style={{ color: colors.moss, fontWeight: '900', fontSize: 16 }}>✓</Text> : null}
      </Animated.View>
      <Text
        style={{
          flex: 1,
          fontSize: 16,
          lineHeight: 22,
          fontWeight: checked ? '600' : '700',
          color: checked ? colors.muted : colors.ink,
          textDecorationLine: checked ? 'line-through' : 'none',
        }}
      >
        {label || '(숙제 항목)'}
      </Text>
    </AnimatedPressable>
  );
}

export function LessonHomeworkChecklist({ note, checkedIds, onToggleItem, disabled }: Props) {
  const items = lessonChecklistItems(note);
  const progress = lessonChecklistProgress(note, checkedIds);
  const checked = new Set(checkedIds);

  if (items.length === 0) {
    return (
      <Text style={{ color: colors.muted, lineHeight: 22 }}>
        강사가 수업 내용에 `- [ ]` 체크 줄을 넣으면 숙제 목록이 여기에 표시됩니다.
      </Text>
    );
  }

  return (
    <View style={{ gap: 10 }}>
      <Text style={{ color: colors.pine, fontWeight: '800', fontSize: 15 }}>
        {progress.done}/{progress.total} 완료
      </Text>
      {items.map((item) => (
        <ChecklistRow
          key={item.itemId}
          itemId={item.itemId}
          label={item.label}
          checked={checked.has(item.itemId)}
          onToggle={(on) => onToggleItem(item.itemId, on)}
          disabled={disabled}
        />
      ))}
    </View>
  );
}
