import { Pressable, Text, View } from 'react-native';
import {
  lessonChecklistProgress,
  parseLessonContent,
  type LessonContentBlock,
} from './lessonChecklist';
import { colors } from './theme';

type Props = {
  note: string;
  checkedIds?: string[];
  interactive?: boolean;
  onToggleItem?: (itemId: string, checked: boolean) => void;
};

function headingStyle(level: 1 | 2 | 3) {
  if (level === 1) return { fontSize: 20, fontWeight: '800' as const };
  if (level === 2) return { fontSize: 17, fontWeight: '800' as const };
  return { fontSize: 15, fontWeight: '800' as const };
}

function renderBlock(
  block: LessonContentBlock,
  checkedIds: Set<string>,
  interactive: boolean,
  onToggleItem?: (itemId: string, checked: boolean) => void
) {
  if (block.type === 'heading') {
    return (
      <Text key={`${block.type}-${block.text}`} style={{ ...headingStyle(block.level), color: colors.ink, marginTop: 10 }}>
        {block.text}
      </Text>
    );
  }
  if (block.type === 'paragraph') {
    return (
      <Text key={`p-${block.text}`} style={{ color: colors.ink, marginTop: 8, lineHeight: 22 }}>
        {block.text}
      </Text>
    );
  }
  const studentChecked = checkedIds.has(block.itemId);
  const box = studentChecked ? '☑' : '☐';
  const labelStyle = {
    color: studentChecked ? colors.moss : colors.ink,
    fontWeight: studentChecked ? '800' as const : '600' as const,
    flex: 1,
    lineHeight: 22,
  };
  if (!interactive || !onToggleItem) {
    return (
      <View key={block.itemId} style={{ flexDirection: 'row', gap: 8, marginTop: 8, alignItems: 'flex-start' }}>
        <Text style={{ fontSize: 18, color: colors.ink }}>{box}</Text>
        <Text style={labelStyle}>{block.label}</Text>
      </View>
    );
  }
  return (
    <Pressable
      key={block.itemId}
      onPress={() => onToggleItem(block.itemId, !studentChecked)}
      style={{ flexDirection: 'row', gap: 8, marginTop: 8, alignItems: 'flex-start' }}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: studentChecked }}
    >
      <Text style={{ fontSize: 18, color: studentChecked ? colors.moss : colors.ink }}>{box}</Text>
      <Text style={labelStyle}>{block.label}</Text>
    </Pressable>
  );
}

export function LessonContentView({ note, checkedIds, interactive, onToggleItem }: Props) {
  const trimmed = note.trim();
  if (!trimmed) {
    return <Text style={{ color: colors.muted, marginTop: 8 }}>수업 내용이 아직 없습니다.</Text>;
  }

  const blocks = parseLessonContent(trimmed);
  const hasChecklist = blocks.some((b) => b.type === 'checkbox');
  const checked = new Set(checkedIds || []);
  const progress = lessonChecklistProgress(trimmed, checkedIds);

  if (!hasChecklist) {
    return <Text style={{ color: colors.ink, marginTop: 8, lineHeight: 22 }}>{trimmed}</Text>;
  }

  return (
    <View style={{ marginTop: 8 }}>
      <Text style={{ color: colors.muted, fontWeight: '700', marginBottom: 4 }}>수업 내용</Text>
      {progress.total > 0 ? (
        <Text style={{ color: colors.pine, fontWeight: '800', marginBottom: 6 }}>
          진행 {progress.done}/{progress.total}
        </Text>
      ) : null}
      {blocks.map((block, index) => (
        <View key={`${block.type}-${index}`}>
          {renderBlock(block, checked, Boolean(interactive), onToggleItem)}
        </View>
      ))}
    </View>
  );
}
