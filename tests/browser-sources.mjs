import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';

test('the functions sent to Chromium match the Worker implementations', async () => {
  const source = readFileSync(new URL('../worker.js', import.meta.url), 'utf8');
  // The deployed Worker keeps literal copies for evaluation in the remote page.
  const loadWorker = (extra) => import('data:text/javascript;base64,' +
    Buffer.from(source + '\n' + extra).toString('base64'));
  const {BROWSER_SOURCES520: browser} = await loadWorker('export {BROWSER_SOURCES520};');
  const names = Object.keys(browser);
  assert.ok(names.includes('readerScreen1697'));
  assert.ok(names.includes('tutaScreen520'));
  const functions = await loadWorker('export {' + names.join(',') + '};');
  for (const name of names) assert.equal(browser[name], functions[name].toString(), name);
});
