import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { starte } from '../../src/web/starten.mjs';
import { erstelleLogger } from '../../src/kern/logger.mjs';

function aufPort(port, { zeilen, bot, beende }) {
  return starte(express(), {
    konfig: { port, panelUrl: `http://localhost:${port}`, sicheresCookie: false },
    logger: erstelleLogger({ schreibe: (z) => zeilen.push(z) }),
    bot,
    beende,
  });
}

/** Wartet, bis der Server offen ist — und liefert den Port, den er bekam. */
function offen(server) {
  return new Promise((fertig) => server.on('listening', () => fertig(server.address().port)));
}

test('ist der Port belegt, bricht der zweite Start ab und trennt den Bot', async (t) => {
  // Der Bot meldet sich vor dem Port bei Discord an. Ein zweiter Prozess wäre
  // sonst am Gateway und verschickte jede Nachricht ein zweites Mal.
  const zeilen = [];
  const erster = aufPort(0, { zeilen, bot: {}, beende: () => {} });
  t.after(() => erster.close());
  const port = await offen(erster);

  let beendet = false;
  const abbrueche = [];
  const zweiter = aufPort(port, {
    zeilen,
    bot: { beende: async () => { beendet = true; } },
    beende: (code) => abbrueche.push(code),
  });

  await new Promise((fertig) => zweiter.on('error', () => setTimeout(fertig, 10)));

  assert.equal(beendet, true, 'der Bot wurde vom Gateway getrennt');
  assert.deepEqual(abbrueche, [1], 'und der Prozess bricht mit Fehlercode ab');

  const meldung = zeilen.find((z) => z.includes('belegt'));
  assert.ok(meldung, 'die Meldung nennt den belegten Port im Klartext');
  assert.ok(meldung.includes('zwei Bots'), 'und sagt, warum das gefährlich wäre');
});

test('läuft der Start durch, steht die Adresse im Log', async (t) => {
  const zeilen = [];
  const server = aufPort(0, { zeilen, bot: {}, beende: () => {} });
  t.after(() => server.close());
  await offen(server);

  assert.ok(zeilen.some((z) => z.includes('Panel läuft')));
});

test('scheitert der Bot beim Trennen, bricht der Start trotzdem ab', async (t) => {
  const zeilen = [];
  const erster = aufPort(0, { zeilen, bot: {}, beende: () => {} });
  t.after(() => erster.close());
  const port = await offen(erster);

  const abbrueche = [];
  const zweiter = aufPort(port, {
    zeilen,
    bot: { beende: async () => { throw new Error('Client schon kaputt'); } },
    beende: (code) => abbrueche.push(code),
  });

  await new Promise((fertig) => zweiter.on('error', () => setTimeout(fertig, 10)));

  assert.deepEqual(abbrueche, [1]);
  assert.ok(zeilen.some((z) => z.includes('nicht sauber beenden')));
});
