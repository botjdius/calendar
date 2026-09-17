import { useRouter } from 'expo-router';
import { ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FeedbackInbox } from '../../src/FeedbackInbox';
import { ScrollPad } from '../../src/ScrollPad';
import { useStore } from '../../src/store';
import { colors } from '../../src/theme';
import { Button, Screen } from '../../src/ui';

export default function InstructorFeedback() {
  const { feedback, removeFeedback } = useStore();
  const router = useRouter();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
        <Screen title="익명 피드백" subtitle="레슨생이 이름 없이 보낸 말입니다. 누가 적었는지는 저장되지 않습니다.">
          <Button tone="ghost" label="설정으로" onPress={() => router.back()} />
          <FeedbackInbox items={feedback} onRemove={removeFeedback} />
          <ScrollPad />
        </Screen>
      </ScrollView>
    </SafeAreaView>
  );
}
