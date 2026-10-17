// Offline test for the login-page honeypot matcher. Nothing here talks to Plan to Eat.

import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { loginHoneypotName } from '../core/client.js';

describe('login honeypot', () => {
  it('reads the short hyphenated field the login page uses', () => {
    const html = '<input type="text" name="lkp-nmqavihfc" id="lkp-nmqavihfc" autocomplete="off" />';
    assert.equal(loginHoneypotName(html), 'lkp-nmqavihfc');
  });

  it('ignores the email field, whose id does not match its name', () => {
    const html = '<input type="text" name="login[email]" id="login_email" />';
    assert.equal(loginHoneypotName(html), '');
  });
});
