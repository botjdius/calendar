import assert from 'node:assert/strict';
import { mergeBanks, packBanks } from '../server/bank.mjs';

const one = packBanks({ bankName: '카카오', accountNumber: '111', accountHolder: '서연' });
assert.equal(one.banks.length, 1);
assert.equal(one.bank.accountNumber, '111');
assert.ok(one.banks[0].id);

const two = packBanks(undefined, [
  { id: 'a', bankName: '카카오', accountNumber: '111', accountHolder: '서연' },
  { id: 'b', bankName: '국민', accountNumber: '222', accountHolder: '서연' },
  { id: 'c', bankName: '신한', accountNumber: '333', accountHolder: '서연' },
]);
assert.equal(two.banks.length, 2);
assert.equal(two.banks[1].accountNumber, '222');

const empty = packBanks({ bankName: '', accountNumber: '', accountHolder: '' }, []);
assert.equal(empty.banks.length, 0);
assert.equal(empty.bank.accountNumber, '');

const legacy = mergeBanks(
  { bank: { bankName: '카카오', accountNumber: '999', accountHolder: '서연' } },
  {
    banks: [
      { id: 'a', bankName: '카카오', accountNumber: '111', accountHolder: '서연' },
      { id: 'b', bankName: '국민', accountNumber: '222', accountHolder: '서연' },
    ],
  }
);
assert.equal(legacy.banks.length, 2);
assert.equal(legacy.banks[0].accountNumber, '999');
assert.equal(legacy.banks[1].accountNumber, '222');

const newerList = mergeBanks(
  {
    banks: [{ id: 'a', bankName: '카카오', accountNumber: '111', accountHolder: '서연' }],
  },
  {
    banks: [
      { id: 'a', bankName: '카카오', accountNumber: '111', accountHolder: '서연' },
      { id: 'b', bankName: '국민', accountNumber: '222', accountHolder: '서연' },
    ],
  }
);
assert.equal(newerList.banks.length, 1);

console.log('bank tests ok');
