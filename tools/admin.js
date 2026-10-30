#!/usr/bin/env node
/**
 * One admin command from the shell, over the same socket the host page uses.
 *   node tools/admin.js lobby --key 9632
 *   node tools/admin.js session short --key 9632
 *   node tools/admin.js party_start --key 9632
 */
'use strict';
const { io } = require('socket.io-client');
const args = process.argv.slice(2);
const action = args[0] || 'state';
const value = args[1] && !args[1].startsWith('--') ? args[1] : undefined;
const flag = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : d; };
const URL = flag('url', 'http://localhost:9520');
const KEY = String(flag('key', '')).toUpperCase();
const sock = io(URL, { transports: ['websocket'] });
sock.on('connect', () => {
  sock.emit('host_hello', { admin: true, key: KEY });
  const msg = { action, key: KEY };
  if (value !== undefined) msg.value = isNaN(Number(value)) ? value : Number(value);
  sock.emit('admin', msg, (r) => { console.log(JSON.stringify(r)); sock.close(); process.exit(r && r.ok === false ? 1 : 0); });
});
sock.on('connect_error', (e) => { console.error('connect_error', e.message); process.exit(2); });
setTimeout(() => { console.error('timeout'); process.exit(3); }, 6000);
