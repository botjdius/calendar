export const BANK_MAX = 2;

export const emptyBank = () => ({
  id: '',
  bankName: '',
  accountNumber: '',
  accountHolder: '',
});

function bankId() {
  return `b${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function sanitizeBank(raw) {
  return {
    id: String(raw?.id || '').trim(),
    bankName: String(raw?.bankName || '').trim(),
    accountNumber: String(raw?.accountNumber || '').trim(),
    accountHolder: String(raw?.accountHolder || '').trim(),
  };
}

export function isBlankBank(bank) {
  return !String(bank?.bankName || '').trim() && !String(bank?.accountNumber || '').trim() && !String(bank?.accountHolder || '').trim();
}

export function packBanks(bank, banks) {
  const raw = Array.isArray(banks) ? banks : bank && !isBlankBank(sanitizeBank(bank)) ? [bank] : [];
  const seen = new Set();
  const list = [];
  for (const item of raw) {
    const next = sanitizeBank(item);
    if (isBlankBank(next)) continue;
    const key = next.id || `n:${next.bankName}|${next.accountNumber}|${next.accountHolder}`;
    if (seen.has(key)) continue;
    seen.add(key);
    list.push({ ...next, id: next.id || bankId() });
    if (list.length >= BANK_MAX) break;
  }
  return { banks: list, bank: list[0] ?? emptyBank() };
}

export function mergeBanks(preferred, fallback) {
  if (Array.isArray(preferred?.banks)) return packBanks(preferred?.bank, preferred?.banks);
  const fall = packBanks(fallback?.bank, fallback?.banks);
  const pref = packBanks(preferred?.bank, preferred?.banks);
  if (!pref.banks.length) return fall;
  if (fall.banks.length <= 1) return pref;
  return packBanks(undefined, [pref.banks[0], ...fall.banks.slice(1)]);
}
