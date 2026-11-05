import { useCallback, useEffect, useRef, useState } from 'react';

type SavePhase = 'idle' | 'saving' | 'saved';

/** Per-key save labels that survive parent re-renders from cloud sync without oscillating. */
export function useKeyedSaveFeedback(clearMs = 1600) {
  const phasesRef = useRef<Record<string, SavePhase>>({});
  const timersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const [, bump] = useState(0);
  const rerender = useCallback(() => bump((n) => n + 1), []);

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      for (const id of Object.keys(timers)) clearTimeout(timers[id]);
    };
  }, []);

  const phase = useCallback((key: string): SavePhase => phasesRef.current[key] || 'idle', []);

  const run = useCallback(
    async (key: string, action: () => void | Promise<void>) => {
      if (phase(key) === 'saving') return;
      phasesRef.current[key] = 'saving';
      rerender();
      try {
        await action();
        phasesRef.current[key] = 'saved';
        rerender();
        clearTimeout(timersRef.current[key]);
        timersRef.current[key] = setTimeout(() => {
          phasesRef.current[key] = 'idle';
          rerender();
        }, clearMs);
      } catch {
        phasesRef.current[key] = 'idle';
        rerender();
      }
    },
    [clearMs, phase, rerender]
  );

  const buttonLabel = useCallback(
    (key: string, base: string, savingLabel = '저장 중…', savedLabel = '저장됨') => {
      const p = phase(key);
      if (p === 'saving') return savingLabel;
      if (p === 'saved') return savedLabel;
      return base;
    },
    [phase]
  );

  const busy = useCallback((key: string) => phase(key) === 'saving', [phase]);

  return { run, buttonLabel, busy, phase };
}
