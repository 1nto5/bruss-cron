import { readFileSync, writeFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// buffer-equal-constant-time@1.0.1 accesses SlowBuffer.prototype which
// was removed in Node 25. Patch the module to guard against missing SlowBuffer.
// See: https://github.com/salesforce/buffer-equal-constant-time/issues/2
const target = join(root, 'node_modules', 'buffer-equal-constant-time', 'index.js');

if (!existsSync(target)) process.exit(0);

const content = readFileSync(target, 'utf8');
if (content.includes('// PATCHED')) process.exit(0);

const patched = `/*jshint node:true */
// PATCHED: guard SlowBuffer access for Node 25+ (SlowBuffer removed)
'use strict';
var Buffer = require('buffer').Buffer;
var SlowBuffer = require('buffer').SlowBuffer;

module.exports = bufferEq;

function bufferEq(a, b) {
  if (!Buffer.isBuffer(a) || !Buffer.isBuffer(b)) {
    return false;
  }
  if (a.length !== b.length) {
    return false;
  }
  var c = 0;
  for (var i = 0; i < a.length; i++) {
    /*jshint bitwise:false */
    c |= a[i] ^ b[i]; // XOR
  }
  return c === 0;
}

bufferEq.install = function() {
  Buffer.prototype.equal = function equal(that) {
    return bufferEq(this, that);
  };
  if (SlowBuffer) {
    SlowBuffer.prototype.equal = Buffer.prototype.equal;
  }
};

var origBufEqual = Buffer.prototype.equal;
var origSlowBufEqual = SlowBuffer ? SlowBuffer.prototype.equal : undefined;
bufferEq.restore = function() {
  Buffer.prototype.equal = origBufEqual;
  if (SlowBuffer) {
    SlowBuffer.prototype.equal = origSlowBufEqual;
  }
};
`;

writeFileSync(target, patched);
console.log('[patch-deps] Patched buffer-equal-constant-time for Node 25+ compatibility');
