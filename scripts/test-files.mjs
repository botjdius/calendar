import assert from 'node:assert/strict';
import {
  assertAttachSize,
  base64FromDataUri,
  bytesFromBase64,
  CLOUD_FILE_MAX,
  dataUri,
  HUB_FILE_MAX,
} from '../src/fileCodec.mjs';
import {
  chunkText,
  idsFromPointer,
  mergeSessionAttachments,
  pointerFromIds,
  stripDataUriAttachments,
  uploadBase64ToRentry,
  uploadToGofile,
  downloadPointer,
} from '../src/fileCloud.mjs';

assert.equal(base64FromDataUri('data:text/plain;base64,YQ=='), 'YQ==');
assert.equal(base64FromDataUri('YQ=='), 'YQ==');
assert.equal(dataUri('text/plain', 'YQ=='), 'data:text/plain;base64,YQ==');
assert.equal(bytesFromBase64('YQ=='), 3);
assert.throws(() => assertAttachSize(CLOUD_FILE_MAX + 1));
assert.doesNotThrow(() => assertAttachSize(100));
assert.doesNotThrow(() => assertAttachSize(CLOUD_FILE_MAX));
assert.throws(() => assertAttachSize(HUB_FILE_MAX + 1, true));
assert.doesNotThrow(() => assertAttachSize(HUB_FILE_MAX, true));

assert.deepEqual(chunkText('abcdef', 2), ['ab', 'cd', 'ef']);
assert.equal(pointerFromIds(['aa', 'bb']), 'rentryfile:aa,bb');
assert.deepEqual(idsFromPointer('rentryfile:aa,bb'), ['aa', 'bb']);
assert.deepEqual(idsFromPointer('rentryfile:jyangjyang-files#f1'), ['jyangjyang-files#f1']);

const deleted = mergeSessionAttachments([], [{ id: 'f1', name: 'a', uri: 'data:text/plain;base64,YQ==' }]);
assert.equal(deleted.length, 0, 'newer empty list must delete');
const tombstoned = mergeSessionAttachments(
  [{ id: 'f1', name: 'a', uri: 'rentryfile:aa' }],
  [{ id: 'f1', name: 'a', uri: 'rentryfile:aa' }],
  ['f1']
);
assert.equal(tombstoned.length, 0, 'removedAttachmentIds must drop restored student files');
const added = mergeSessionAttachments(
  [{ id: 'f1', name: 'a', uri: 'rentryfile:aa' }],
  []
);
assert.equal(added[0].uri, 'rentryfile:aa', 'newer list keeps added file');
const enriched = mergeSessionAttachments(
  [{ id: 'f1', name: 'a', uri: 'rentryfile:aa' }],
  [{ id: 'f1', name: 'a', uri: 'data:text/plain;base64,YQ==' }]
);
assert.equal(enriched[0].uri, 'data:text/plain;base64,YQ==', 'keep local data uri when cloud has pointer');

const stripped = stripDataUriAttachments([
  {
    id: 's1',
    sessions: [
      {
        id: 'x',
        attachments: [
          { id: 'keep', uri: 'rentryfile:aa' },
          { id: 'drop', uri: 'data:text/plain;base64,YQ==' },
        ],
      },
    ],
  },
]);
assert.equal(stripped[0].sessions[0].attachments.length, 1);
assert.equal(stripped[0].sessions[0].attachments[0].id, 'keep');

const marker = `jyang-file-test-${Date.now()}`;
const encoded = Buffer.from(marker).toString('base64');
const pointer = await uploadBase64ToRentry(encoded);
assert.match(pointer, /^rentryfile:/);
assert.equal(await downloadPointer(pointer), encoded);

const pdfPointer = 'rentryfile:jyangjf00,jyangjf01,jyangjf02,jyangjf03,jyangjf04';
const pdfData = await downloadPointer(pdfPointer);
assert.equal(Buffer.from(pdfData, 'base64').subarray(0, 5).toString(), '%PDF-', 'student download must rebuild the attached pdf');
const goUrl = await uploadToGofile(new Blob([Buffer.from('jyang-gofile-test')]), 't.txt', 'text/plain');
assert.match(goUrl, /^https:\/\/gofile\.io\/d\//, 'large-file host must return a public download page');

console.log('file tests ok', pointer, goUrl);
