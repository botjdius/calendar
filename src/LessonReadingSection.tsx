import { Text, View } from 'react-native';
import { lessonReadingBlocks, type LessonContentBlock } from './lessonChecklist';
import { colors } from './theme';

function headingStyle(level: 1 | 2 | 3) {
  if (level === 1) return { fontSize: 20, fontWeight: '800' as const };
  if (level === 2) return { fontSize: 17, fontWeight: '800' as const };
  return { fontSize: 15, fontWeight: '800' as const };
}

function renderBlock(block: LessonContentBlock, index: number) {
  if (block.type === 'heading') {
    return (
      <Text
        key={`h-${index}`}
        style={{ ...headingStyle(block.level), color: colors.ink, marginTop: index === 0 ? 0 : 12 }}
      >
        {block.text}
      </Text>
    );
  }
  if (block.type === 'paragraph') {
    return (
      <Text key={`p-${index}`} style={{ color: colors.ink, marginTop: 10, lineHeight: 24, fontSize: 16 }}>
        {block.text}
      </Text>
    );
  }
  return null;
}

type Props = {
  note: string;
};

export function LessonReadingSection({ note }: Props) {
  const trimmed = note.trim();
  if (!trimmed) {
    return <Text style={{ color: colors.muted, lineHeight: 22 }}>오늘 수업 내용이 아직 없습니다.</Text>;
  }

  const blocks = lessonReadingBlocks(trimmed);
  if (blocks.length === 0) {
    return <Text style={{ color: colors.muted, lineHeight: 22 }}>체크 항목만 있고 별도 설명은 없습니다.</Text>;
  }

  return <View>{blocks.map((block, index) => renderBlock(block, index))}</View>;
}
