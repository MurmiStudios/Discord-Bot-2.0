import { test } from 'node:test';
import assert from 'node:assert/strict';
import { alsZeitpunkt } from '../../src/web/html/zeit.mjs';

test('ein Zeitstempel wird deutsch geschrieben und nicht als ISO gezeigt', () => {
  const gezeigt = alsZeitpunkt('2026-09-02T16:24:16.006Z');

  assert.doesNotMatch(gezeigt, /T\d\d:\d\d:\d\d/, 'Der rohe ISO-Wert steht auf der Seite');
  assert.match(gezeigt, /^\d\d\.\d\d\.\d{4}, \d\d:\d\d Uhr$/);
});

test('ein unlesbarer Wert wird gezeigt, statt eine Zeit zu erfinden', () => {
  assert.equal(alsZeitpunkt('kein Datum'), 'kein Datum');
  assert.equal(alsZeitpunkt(null), '');
  assert.equal(alsZeitpunkt(undefined), '');
});
