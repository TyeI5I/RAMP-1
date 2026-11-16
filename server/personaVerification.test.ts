import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import test from 'node:test';
import { isValidPersonaSignature } from './personaVerification';

const sign = (body: Buffer, secret: string, timestamp: number) =>
  createHmac('sha256', secret)
    .update(`${timestamp}.${body.toString('utf8')}`)
    .digest('hex');

test('accepts a valid Persona signature', () => {
  const body = Buffer.from('{"data":{"id":"evt_test"}}');
  const timestamp = 1_800_000_000;
  const signature = sign(body, 'webhook-secret', timestamp);

  assert.equal(
    isValidPersonaSignature(`t=${timestamp},v1=${signature}`, body, 'webhook-secret', timestamp),
    true
  );
});

test('accepts a matching rotated secret signature and rejects a tampered body', () => {
  const body = Buffer.from('{"event":"approved"}');
  const timestamp = 1_800_000_000;
  const previousSignature = sign(body, 'previous-secret', timestamp);
  const activeSignature = sign(body, 'active-secret', timestamp);

  assert.equal(
    isValidPersonaSignature(
      `t=${timestamp},v1=${previousSignature} t=${timestamp},v1=${activeSignature}`,
      body,
      'active-secret',
      timestamp
    ),
    true
  );
  assert.equal(
    isValidPersonaSignature(
      `t=${timestamp},v1=${activeSignature}`,
      Buffer.from('{"event":"declined"}'),
      'active-secret',
      timestamp
    ),
    false
  );
});

test('rejects missing and stale signatures', () => {
  const body = Buffer.from('{}');
  const timestamp = 1_800_000_000;
  const signature = sign(body, 'webhook-secret', timestamp);

  assert.equal(isValidPersonaSignature(undefined, body, 'webhook-secret', timestamp), false);
  assert.equal(
    isValidPersonaSignature(
      `t=${timestamp - 301},v1=${signature}`,
      body,
      'webhook-secret',
      timestamp
    ),
    false
  );
});
