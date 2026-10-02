import { ReactNode, useState } from 'react';
import * as Clipboard from 'expo-clipboard';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  ViewStyle,
} from 'react-native';
import type { BankAccount } from './types';
import { bankLabel, packBanks } from './bank';
import { colors, radius } from './theme';

export function Screen({
  children,
  title,
  subtitle,
}: {
  children: ReactNode;
  title: string;
  subtitle?: string;
}) {
  return (
    <View style={styles.screen}>
      <Text style={styles.kicker}>쟝쟝 · Jyang Jyang</Text>
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      {children}
    </View>
  );
}

export function Card({
  children,
  style,
}: {
  children: ReactNode;
  style?: ViewStyle;
}) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Fold({
  title,
  defaultOpen = false,
  plainTitle = false,
  children,
  action,
}: {
  title: string;
  defaultOpen?: boolean;
  plainTitle?: boolean;
  children?: ReactNode;
  action?: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const header = (
    <>
      <Text style={styles.foldTitle}>{plainTitle ? title : open ? `${title} 접기` : `${title} 펼치기`}</Text>
      <View style={styles.foldChevron}>
        <Text style={[styles.foldChevronMark, { marginTop: open ? 4 : -2 }]}>{open ? '⌃' : '⌄'}</Text>
      </View>
    </>
  );
  return (
    <View style={styles.fold}>
      {action ? (
        <View style={[styles.foldHit, styles.foldHitRow]}>
          <Pressable onPress={() => setOpen((value) => !value)} style={{ alignItems: 'center' }}>
            {header}
          </Pressable>
          {action}
        </View>
      ) : (
        <Pressable onPress={() => setOpen((value) => !value)} style={styles.foldHit}>
          {header}
        </Pressable>
      )}
      {open ? children : null}
    </View>
  );
}

export function Field({
  label,
  value,
  onChangeText,
  placeholder,
  secure,
  keyboardType,
  autoCapitalize = 'none',
  multiline,
  minHeight,
}: {
  label: string;
  value: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
  secure?: boolean;
  keyboardType?: 'default' | 'email-address';
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  multiline?: boolean;
  minHeight?: number;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        secureTextEntry={secure}
        autoCapitalize={autoCapitalize}
        keyboardType={keyboardType}
        multiline={multiline}
        textAlignVertical={multiline ? 'top' : 'center'}
        style={[styles.input, multiline && { minHeight: minHeight || 88 }]}
      />
    </View>
  );
}

export function ConfirmBox({
  title,
  message,
  confirmLabel = '삭제',
  onCancel,
  onConfirm,
}: {
  title: string;
  message: string;
  confirmLabel?: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <View style={styles.confirm}>
      <Text style={styles.confirmTitle}>{title}</Text>
      <Text style={styles.confirmMsg}>{message}</Text>
      <View style={styles.confirmRow}>
        <View style={{ flex: 1 }}>
          <Button tone="ghost" label="취소" onPress={onCancel} />
        </View>
        <View style={{ flex: 1 }}>
          <Button tone="wine" label={confirmLabel} onPress={onConfirm} />
        </View>
      </View>
    </View>
  );
}

export function Button({
  label,
  onPress,
  tone = 'pine',
  disabled,
}: {
  label: string;
  onPress: () => void;
  tone?: 'pine' | 'clay' | 'wine' | 'ghost';
  disabled?: boolean;
}) {
  const bg =
    tone === 'clay'
      ? colors.clay
      : tone === 'wine'
        ? colors.wine
        : tone === 'ghost'
          ? 'transparent'
          : colors.pine;
  const color = tone === 'ghost' ? colors.pine : '#fff';
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.btn,
        { backgroundColor: bg, opacity: disabled ? 0.45 : pressed ? 0.8 : 1 },
        tone === 'ghost' && styles.btnGhost,
      ]}
    >
      <Text style={[styles.btnText, { color }]}>{label}</Text>
    </Pressable>
  );
}

export function Pill({
  label,
  tone = 'muted',
}: {
  label: string;
  tone?: 'muted' | 'moss' | 'wine' | 'clay' | 'pine';
}) {
  const map = {
    muted: { bg: colors.line, fg: colors.ink },
    moss: { bg: colors.mossSoft, fg: colors.moss },
    wine: { bg: colors.wineSoft, fg: colors.wine },
    clay: { bg: colors.claySoft, fg: colors.clay },
    pine: { bg: colors.pineSoft, fg: colors.pine },
  }[tone];
  return (
    <View style={[styles.pill, { backgroundColor: map.bg }]}>
      <Text style={[styles.pillText, { color: map.fg }]}>{label}</Text>
    </View>
  );
}

export function Loading() {
  return (
    <View style={styles.loading}>
      <ActivityIndicator color={colors.pine} />
    </View>
  );
}

export function AccountCopy({
  bank,
  banks,
  embedded = false,
  onRemove,
}: {
  bank?: BankAccount;
  banks?: BankAccount[];
  embedded?: boolean;
  onRemove?: (item: BankAccount) => void;
}) {
  const [copiedId, setCopiedId] = useState('');
  const list = packBanks(bank, banks).banks;

  async function copy(item: BankAccount) {
    const number = item.accountNumber.trim();
    if (!number) return;
    await Clipboard.setStringAsync(number);
    setCopiedId(item.id || number);
    setTimeout(() => setCopiedId(''), 1600);
  }

  const body = !list.length ? (
    <>
      {embedded ? null : <Text style={styles.label}>등록 계좌</Text>}
      <Text style={{ color: colors.muted, marginTop: embedded ? 0 : 4 }}>강사가 계좌번호를 등록하면 여기에 보입니다.</Text>
    </>
  ) : (
    <>
      {embedded ? null : <Text style={styles.label}>등록 계좌</Text>}
      {list.map((item, index) => (
        <Fold
          key={item.id || `${item.accountNumber}-${index}`}
          title={bankLabel(item)}
          action={
            onRemove ? (
              <Pressable onPress={() => onRemove(item)}>
                <Text style={{ color: colors.wine, fontWeight: '800' }}>삭제</Text>
              </Pressable>
            ) : null
          }
        >
          {item.accountHolder ? (
            <Text style={{ color: colors.muted }}>{item.accountHolder}</Text>
          ) : null}
          <Text selectable style={styles.accountNumber}>
            {item.accountNumber}
          </Text>
          <Button
            label={copiedId === (item.id || item.accountNumber) ? '복사됨' : '계좌번호 복사'}
            onPress={() => copy(item)}
            tone="clay"
          />
        </Fold>
      ))}
    </>
  );

  if (embedded) return body;
  return <Card>{body}</Card>;
}

const styles = StyleSheet.create({
  screen: {
    flexGrow: 1,
    backgroundColor: colors.bg,
    paddingHorizontal: 20,
    paddingTop: 28,
    paddingBottom: 16,
    overflow: 'visible',
  },
  kicker: {
    color: colors.clay,
    fontWeight: '700',
    letterSpacing: 0.6,
    fontSize: 12,
    marginBottom: 4,
  },
  title: { fontSize: 28, fontWeight: '800', color: colors.ink },
  subtitle: { marginTop: 6, marginBottom: 14, color: colors.muted, fontSize: 15, lineHeight: 22 },
  card: {
    backgroundColor: colors.paper,
    borderRadius: radius.lg,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.line,
    marginBottom: 12,
  },
  field: { marginBottom: 12 },
  label: { color: colors.muted, fontSize: 13, marginBottom: 6, fontWeight: '600' },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.ink,
  },
  btn: {
    borderRadius: radius.md,
    paddingVertical: 14,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
    minHeight: 48,
    overflow: 'visible',
  },
  btnGhost: { borderWidth: 1, borderColor: colors.pine },
  btnText: { fontWeight: '800', fontSize: 16, textAlign: 'center' },
  confirm: {
    backgroundColor: colors.wineSoft,
    borderRadius: radius.md,
    padding: 14,
    marginTop: 8,
    borderWidth: 1,
    borderColor: colors.wine,
  },
  confirmTitle: { fontWeight: '800', fontSize: 16, color: colors.wine, marginBottom: 6 },
  confirmMsg: { color: colors.ink, fontWeight: '600', marginBottom: 10, lineHeight: 22 },
  confirmRow: { flexDirection: 'row', gap: 8 },
  pill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  pillText: { fontSize: 12, fontWeight: '700' },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  accountNumber: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.ink,
    letterSpacing: 0.4,
    marginTop: 4,
  },
  fold: { marginBottom: 4 },
  foldHit: { alignItems: 'center', paddingVertical: 8 },
  foldHitRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 10 },
  foldTitle: {
    fontWeight: '800',
    fontSize: 16,
    color: colors.muted,
    marginBottom: 8,
    textAlign: 'center',
  },
  foldChevron: {
    width: 36,
    height: 36,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: colors.ink,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  foldChevronMark: { fontSize: 18, fontWeight: '800', color: colors.ink },
});
