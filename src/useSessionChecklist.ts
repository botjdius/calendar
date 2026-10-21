import { useCallback, useEffect, useState } from 'react';
import {
  mergeCloudAndLocalChecklist,
  readLocalChecklistChecked,
  writeLocalChecklistChecked,
} from './checklistLocalStore';
import { toggleChecklistChecked } from './lessonChecklist';

type Args = {
  studentId: string;
  sessionId: string;
  cloudChecked: string[] | undefined;
  setChecklistItem: (sessionId: string, itemId: string, checked: boolean) => Promise<void>;
};

export function useSessionChecklist({ studentId, sessionId, cloudChecked, setChecklistItem }: Args) {
  const [localChecked, setLocalChecked] = useState<string[] | undefined>(undefined);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const local = await readLocalChecklistChecked(studentId, sessionId);
      if (!cancelled) setLocalChecked(local);
    })();
    return () => {
      cancelled = true;
    };
  }, [studentId, sessionId]);

  const mergedChecked = mergeCloudAndLocalChecklist(cloudChecked, localChecked);

  const toggleItem = useCallback(
    async (itemId: string, checked: boolean) => {
      const next = toggleChecklistChecked(mergedChecked, itemId, checked);
      setLocalChecked(next);
      await writeLocalChecklistChecked(studentId, sessionId, next);
      setSyncing(true);
      try {
        await setChecklistItem(sessionId, itemId, checked);
      } finally {
        setSyncing(false);
      }
    },
    [mergedChecked, sessionId, setChecklistItem, studentId]
  );

  return { checkedIds: mergedChecked, toggleItem, syncing, localHydrated: localChecked !== undefined };
}
