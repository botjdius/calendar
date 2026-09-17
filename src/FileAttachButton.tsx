import { createElement, useState } from 'react';
import { Platform, Text, View } from 'react-native';
import { pickAndUploadSessionFile, sessionFileFromBrowserFile } from './files';
import { colors } from './theme';
import type { SessionFile } from './types';
import { Button } from './ui';

export function FileAttachButton({
  label = '파일 첨부',
  hubBase,
  onFile,
  onError,
}: {
  label?: string;
  hubBase: string | null;
  onFile: (file: SessionFile) => Promise<void> | void;
  onError?: (message: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const text = busy ? '첨부 중…' : label;

  async function handleBrowserFile(raw: File) {
    setBusy(true);
    onError?.('');
    try {
      await onFile(await sessionFileFromBrowserFile(raw, hubBase));
    } catch (err) {
      onError?.(err instanceof Error ? err.message : '파일을 첨부하지 못했습니다.');
    } finally {
      setBusy(false);
    }
  }

  if (Platform.OS === 'web') {
    return (
      <View style={{ position: 'relative', marginTop: 8 }}>
        <Button label={text} tone="clay" disabled={busy} onPress={() => undefined} />
        {createElement('input', {
          type: 'file',
          disabled: busy,
          title: label,
          style: {
            position: 'absolute',
            left: 0,
            top: 0,
            right: 0,
            bottom: 0,
            width: '100%',
            height: '100%',
            opacity: 0.01,
            zIndex: 2,
            cursor: busy ? 'default' : 'pointer',
            fontSize: 18,
          },
          onChange: (event: { target: { files?: FileList | null; value: string } }) => {
            const picked = event.target.files?.[0];
            event.target.value = '';
            if (picked) void handleBrowserFile(picked);
          },
        })}
      </View>
    );
  }

  return (
    <View style={{ marginTop: 8 }}>
      <Button
        label={text}
        tone="clay"
        disabled={busy}
        onPress={async () => {
          setBusy(true);
          onError?.('');
          try {
            const file = await pickAndUploadSessionFile(hubBase);
            if (file) await onFile(file);
          } catch (err) {
            onError?.(err instanceof Error ? err.message : '파일을 첨부하지 못했습니다.');
          } finally {
            setBusy(false);
          }
        }}
      />
    </View>
  );
}

export function FileAttachError({ message }: { message: string }) {
  if (!message) return null;
  return (
    <Text style={{ color: colors.wine, fontWeight: '700', marginTop: 8 }}>{message}</Text>
  );
}
