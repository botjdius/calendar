import { useState } from 'react';
import { Text, View } from 'react-native';
import { appendChecklistLineToNote } from './lessonChecklist';
import { colors } from './theme';
import { Button, Field } from './ui';

type Props = {
  note: string;
  onChangeNote: (next: string) => void;
};

export function LessonNoteChecklistTools({ note, onChangeNote }: Props) {
  const [draft, setDraft] = useState('');

  function addItem() {
    onChangeNote(appendChecklistLineToNote(note, draft));
    setDraft('');
  }

  return (
    <View style={{ marginTop: 4, gap: 8 }}>
      <Text style={{ color: colors.muted, fontSize: 13, fontWeight: '600' }}>
        레슨생이 체크할 항목을 아래에서 넣거나, 본문에 직접 적어도 됩니다.
      </Text>
      <Field
        label="체크 항목"
        value={draft}
        onChangeText={setDraft}
        placeholder="예: C 메이저 코드 4회"
        autoCapitalize="sentences"
      />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        <View style={{ flexGrow: 1, minWidth: 140 }}>
          <Button tone="clay" label="체크 항목 추가" onPress={addItem} />
        </View>
        <View style={{ flexGrow: 1, minWidth: 120 }}>
          <Button
            tone="ghost"
            label="빈 체크 줄"
            onPress={() => onChangeNote(appendChecklistLineToNote(note, ''))}
          />
        </View>
      </View>
    </View>
  );
}
