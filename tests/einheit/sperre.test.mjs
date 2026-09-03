import { test } from 'node:test';
import assert from 'node:assert/strict';
import { erstelleSperre, SPERRFENSTER_MS } from '../../src/discord/ereignisse.mjs';

test('dasselbe zweimal gilt als Wiederholung, etwas anderes nicht', () => {
  const sperre = erstelleSperre();

  assert.equal(sperre.wiederholung('a'), false);
  assert.equal(sperre.wiederholung('a'), true);
  assert.equal(sperre.wiederholung('b'), false);
});

test('nach dem Fenster kommt dasselbe wieder durch', () => {
  let uhr = 1_000;
  const sperre = erstelleSperre({ fenster: 100, jetzt: () => uhr });

  assert.equal(sperre.wiederholung('a'), false);
  uhr += 99;
  assert.equal(sperre.wiederholung('a'), true);
  uhr += 2;
  assert.equal(sperre.wiederholung('a'), false, 'nach dem Fenster wieder frei');
});

test('eine Wiederholung schiebt das Fenster nicht weiter', () => {
  // Sonst hielte ein Dauerfeuer die Sperre für immer geschlossen.
  let uhr = 0;
  const sperre = erstelleSperre({ fenster: 100, jetzt: () => uhr });

  sperre.wiederholung('a');
  for (let i = 0; i < 10; i += 1) {
    uhr += 10;
    sperre.wiederholung('a');
  }
  uhr += 1;
  assert.equal(sperre.wiederholung('a'), false);
});

test('alte Einträge werden weggeräumt', () => {
  let uhr = 0;
  const sperre = erstelleSperre({ fenster: 100, jetzt: () => uhr });

  for (let i = 0; i < 500; i += 1) {
    uhr += 10;
    sperre.wiederholung(`m${i}`);
  }

  // Nichts hält länger als das Fenster: übrig bleiben höchstens die letzten
  // paar Schlüssel, nicht alle 500.
  uhr += 1000;
  sperre.wiederholung('letzter');
  assert.equal(sperre.wiederholung('m0'), false, 'm0 ist längst vergessen');
});

test('das Fenster ist kurz genug, um eine gewollte Wiedervergabe nicht zu schlucken', () => {
  assert.ok(SPERRFENSTER_MS <= 30_000);
});
