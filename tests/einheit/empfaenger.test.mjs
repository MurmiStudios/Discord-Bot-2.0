import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loeseEmpfaengerAuf, parseAuswahl, alsAuswahlWert } from '../../src/versand/empfaenger.mjs';
import { erstelleBot } from '../../src/discord/bot.mjs';
import { erstelleGildenAnsicht } from '../../src/discord/gilde.mjs';
import { erstelleLogger } from '../../src/kern/logger.mjs';
import { erstelleClientDoppel } from '../hilfen/discord-doppel.mjs';

const GILDE = '111111111111111111';

const ROLLEN = [
  { id: 'r-neu', name: 'Neu', position: 2 },
  { id: 'r-alt', name: 'Alt', position: 3 },
  { id: 'r-leer', name: 'Leer', position: 4 },
];

const MITGLIEDER = [
  { id: 'm1', name: 'Anna', rollen: ['r-neu'] },
  { id: 'm2', name: 'Bert', rollen: ['r-neu', 'r-alt'] },
  { id: 'm3', name: 'Clara', rollen: ['r-alt'] },
  { id: 'm4', name: 'Bot', rollen: ['r-neu'], bot: true },
];

async function mitAnsicht() {
  const { client } = erstelleClientDoppel({ guildId: GILDE, rollen: ROLLEN, mitglieder: MITGLIEDER });
  const bot = erstelleBot({
    konfig: { token: 'x'.repeat(40), guildId: GILDE },
    logger: erstelleLogger({ schreibe: () => {} }),
    erzeugeClient: () => client,
  });
  await bot.verbinde();
  await new Promise((f) => setTimeout(f, 0));
  return erstelleGildenAnsicht({ bot, konfig: { guildId: GILDE } });
}

test('ein einzelnes Mitglied wird zum Empfänger', async () => {
  const ansicht = await mitAnsicht();

  const { empfaenger } = loeseEmpfaengerAuf(ansicht, [{ art: 'mitglied', id: 'm1' }], GILDE);

  assert.deepEqual(empfaenger.map((e) => e.name), ['Anna']);
});

test('eine Rolle wird zu ihren Mitgliedern aufgelöst', async () => {
  const ansicht = await mitAnsicht();

  const { empfaenger } = loeseEmpfaengerAuf(ansicht, [{ art: 'rolle', id: 'r-alt' }], GILDE);

  assert.deepEqual(empfaenger.map((e) => e.name).sort(), ['Bert', 'Clara']);
});

test('wer in zwei gewählten Rollen steckt, bekommt trotzdem nur eine Nachricht', async () => {
  const ansicht = await mitAnsicht();

  const { empfaenger } = loeseEmpfaengerAuf(
    ansicht,
    [{ art: 'rolle', id: 'r-neu' }, { art: 'rolle', id: 'r-alt' }],
    GILDE,
  );

  assert.deepEqual(empfaenger.map((e) => e.name).sort(), ['Anna', 'Bert', 'Clara']);
});

test('ein einzeln gewähltes Mitglied doppelt sich nicht mit seiner Rolle', async () => {
  const ansicht = await mitAnsicht();

  const { empfaenger } = loeseEmpfaengerAuf(
    ansicht,
    [{ art: 'mitglied', id: 'm2' }, { art: 'rolle', id: 'r-alt' }],
    GILDE,
  );

  assert.equal(empfaenger.filter((e) => e.id === 'm2').length, 1);
});

test('Bots bekommen keine Direktnachricht', async () => {
  const ansicht = await mitAnsicht();

  const { empfaenger } = loeseEmpfaengerAuf(ansicht, [{ art: 'rolle', id: 'r-neu' }], GILDE);

  assert.ok(!empfaenger.some((e) => e.name === 'Bot'), 'Der Bot steht in der Empfängerliste');
});

test('eine Rolle ohne Mitglieder ergibt keine Empfänger und wird benannt', async () => {
  const ansicht = await mitAnsicht();

  const ergebnis = loeseEmpfaengerAuf(ansicht, [{ art: 'rolle', id: 'r-leer' }], GILDE);

  assert.deepEqual(ergebnis.empfaenger, []);
  assert.ok(ergebnis.leereRollen.some((r) => r.name === 'Leer'));
});

test('ein ausgetretenes Mitglied wird benannt statt stillschweigend übergangen', async () => {
  const ansicht = await mitAnsicht();

  const ergebnis = loeseEmpfaengerAuf(ansicht, [{ art: 'mitglied', id: 'weg' }], GILDE);

  assert.deepEqual(ergebnis.empfaenger, []);
  assert.equal(ergebnis.verschwunden.length, 1);
  assert.equal(ergebnis.verschwunden[0].id, 'weg');
});

test('eine gelöschte Rolle wird ebenfalls benannt', async () => {
  const ansicht = await mitAnsicht();

  const ergebnis = loeseEmpfaengerAuf(ansicht, [{ art: 'rolle', id: 'gibt-es-nicht' }], GILDE);

  assert.equal(ergebnis.verschwunden.length, 1);
});

test('die Reihenfolge der Empfänger ist stabil nach Namen sortiert', async () => {
  const ansicht = await mitAnsicht();

  const { empfaenger } = loeseEmpfaengerAuf(
    ansicht,
    [{ art: 'rolle', id: 'r-alt' }, { art: 'mitglied', id: 'm1' }],
    GILDE,
  );

  assert.deepEqual(empfaenger.map((e) => e.name), ['Anna', 'Bert', 'Clara']);
});

test('eine leere Auswahl ergibt keine Empfänger und keinen Fehler', async () => {
  const ansicht = await mitAnsicht();

  const ergebnis = loeseEmpfaengerAuf(ansicht, [], GILDE);

  assert.deepEqual(ergebnis.empfaenger, []);
  assert.equal(ergebnis.anzahl, 0);
});

test('die Auswahl wird aus Formularwerten gelesen, unbekannte Arten fallen weg', () => {
  const auswahl = parseAuswahl(['mitglied:m1', 'rolle:r-neu', 'brieftaube:x', 'kaputt', '']);

  assert.deepEqual(auswahl, [
    { art: 'mitglied', id: 'm1' },
    { art: 'rolle', id: 'r-neu' },
  ]);
});

test('eine Auswahl übersteht den Weg durchs Formular unverändert', () => {
  const auswahl = [{ art: 'rolle', id: 'r-neu' }, { art: 'mitglied', id: 'm1' }];

  assert.deepEqual(parseAuswahl(auswahl.map(alsAuswahlWert)), auswahl);
});

test('doppelte Einträge in der Auswahl werden einmal gezählt', () => {
  assert.deepEqual(parseAuswahl(['mitglied:m1', 'mitglied:m1']), [{ art: 'mitglied', id: 'm1' }]);
});

test('genau die erlaubte Anzahl geht durch', async () => {
  const { pruefeGrenze } = await import('../../src/versand/empfaenger.mjs');

  assert.equal(pruefeGrenze({ anzahl: 100 }, 100).ok, true);
});

test('einer zu viel wird abgelehnt und nennt beide Zahlen', async () => {
  const { pruefeGrenze } = await import('../../src/versand/empfaenger.mjs');

  const ergebnis = pruefeGrenze({ anzahl: 101 }, 100);

  assert.equal(ergebnis.ok, false);
  assert.match(ergebnis.meldung, /101/);
  assert.match(ergebnis.meldung, /100/);
});

test('zu viele Empfänger werden abgelehnt, nicht abgeschnitten', async () => {
  const { pruefeGrenze } = await import('../../src/versand/empfaenger.mjs');

  const ergebnis = pruefeGrenze({ anzahl: 250 }, 100);

  assert.equal(ergebnis.ok, false);
  assert.equal(ergebnis.gekuerzt, undefined, 'Es wurde eine gekürzte Liste angeboten');
});

test('ohne Empfänger gibt es nichts zu senden', async () => {
  const { pruefeGrenze } = await import('../../src/versand/empfaenger.mjs');

  const ergebnis = pruefeGrenze({ anzahl: 0 }, 100);

  assert.equal(ergebnis.ok, false);
  assert.match(ergebnis.meldung, /niemand|kein/i);
});

test('die Ablehnung nennt den Weg heraus, nicht nur das Problem', async () => {
  const { pruefeGrenze } = await import('../../src/versand/empfaenger.mjs');

  assert.match(pruefeGrenze({ anzahl: 150 }, 100).meldung, /DM_MAX_RECIPIENTS/);
});
