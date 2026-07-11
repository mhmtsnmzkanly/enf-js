import test from 'node:test';
import assert from 'node:assert/strict';
import { parse, stringify, ENFSyntaxError } from '../../src/index.js';

const valid = ['chat.message.sent', 'chat.message_sent', 'user2.login', 'file.upload_v2.started', 'system.ready', 'true', 'null'];
const invalid = ['Chat.Message', '_chat.started', 'chat-message', '.system', 'system.', 'system..ready', 'chat.-message'];

test('event name namespace grammar', () => {
  for (const name of valid) assert.deepEqual(parse(`${name};`), [{ name }]);
  for (const name of invalid) assert.throws(() => parse(`${name};`), (error) => error instanceof ENFSyntaxError && error.code === 'E_INVALID_EVENT_NAME');
});

test('event names remain one string through round-trip', () => {
  const events = parse('chat.message_sent {user_id: 2};');
  assert.equal(events[0].name, 'chat.message_sent');
  assert.deepEqual(parse(stringify(events)), events);
});
