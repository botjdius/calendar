import { useRouter } from 'expo-router';
import { ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PublicCalendar } from '../../../src/PublicCalendar';
import { useStore } from '../../../src/store';
import { colors } from '../../../src/theme';

export default function InstructorBoard() {
  const { closures, openSlots, requests, students, addClosure, removeClosure, addOpenSlot, removeOpenSlot, decideMakeup } = useStore();
  const router = useRouter();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
        <PublicCalendar
          closures={closures}
          openSlots={openSlots}
          requests={requests}
          students={students}
          instructor
          onAddClosure={addClosure}
          onRemoveClosure={removeClosure}
          onAddSlot={addOpenSlot}
          onRemoveSlot={removeOpenSlot}
          onDecideMakeup={decideMakeup}
          onOpenStudent={(id) => router.push(`/(instructor)/student/${id}`)}
        />
      </ScrollView>
    </SafeAreaView>
  );
}
