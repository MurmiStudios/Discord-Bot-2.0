import { test } from 'node:test';
import assert from 'node:assert/strict';
import { erstelleKette, KettenFehler } from '../../src/aktionen/kette.mjs';
import { erstelleArten } from '../../src/aktionen/arten/index.mjs';

/**
 * Die Ausführungskette.
 *
 * Der Plan verlangt hier 100 % Abdeckung, und das aus einem Grund: Die Kette
 * ist die Stelle, an der bei einem Fehler entschieden wird, ob halb ausgeführt
 * wird oder gar nicht. Jeder Zweig muss belegt sein.
 */

const KONFIG = { guildId: '111111111111111111' };

/** Ein Protokoll, das nur mitschreibt. */
function protokollDoppel() {
  const eintraege = [];
  return { eintraege, schreibe: (guildId, eintrag) => eintraege.push({ guildId, ...eintrag }) };
}

function loggerDoppel() {
  const fehler = [];
  return { fehler: (...a) => fehler.push(a), warn: () => {}, info: () => {}, gesammelt: fehler };
}

/** Eine Art, die gelingt und mitschreibt, dass sie lief. */
const gelingt = (spur, name, { meldung, werte } = {}) => ({
  async fuehreAus(aktion, kontext) {
    spur.push({ name, aktion, werte: kontext.werte });
    return { ok: true, meldung, werte };
  },
});

const scheitert = (spur, name, grund) => ({
  async fuehreAus() {
    spur.push({ name });
    return { ok: false, grund };
  },
});

const wirft = (fehler) => ({
  async fuehreAus() {
    throw fehler;
  },
});

function baue(bausteine) {
  const protokoll = protokollDoppel();
  const logger = loggerDoppel();
  return {
    protokoll,
    logger,
    kette: erstelleKette({ arten: erstelleArten(bausteine), protokoll, logger, konfig: KONFIG }),
  };
}

test('drei Aktionen laufen nacheinander durch', async () => {
  const spur = [];
  const { kette, protokoll } = baue({
    eins: gelingt(spur, 'eins'),
    zwei: gelingt(spur, 'zwei'),
    drei: gelingt(spur, 'drei'),
  });

  const ergebnis = await kette.fuehreAus(
    { beschriftung: 'Los', aktionen: [{ art: 'eins' }, { art: 'zwei' }, { art: 'drei' }] },
    { mitglied: { id: 'm1', name: 'Anna' } },
  );

  assert.equal(ergebnis.ok, true);
  assert.equal(ergebnis.gelaufen, 3);
  assert.equal(ergebnis.grund, null);
  assert.deepEqual(spur.map((s) => s.name), ['eins', 'zwei', 'drei']);
  assert.equal(protokoll.eintraege.length, 0, 'Ein glatter Lauf hat protokolliert');
});

test('ein Fehler in der Mitte bricht ab — die dritte läuft nicht', async () => {
  // Wer „Rolle geben → Bestätigung schicken“ baut, will nicht die Bestätigung
  // ohne die Rolle.
  const spur = [];
  const { kette, protokoll } = baue({
    eins: gelingt(spur, 'eins'),
    zwei: scheitert(spur, 'zwei', 'Dem Bot fehlt das Recht.'),
    drei: gelingt(spur, 'drei'),
  });

  const ergebnis = await kette.fuehreAus(
    { beschriftung: 'Los', aktionen: [{ art: 'eins' }, { art: 'zwei' }, { art: 'drei' }] },
    { mitglied: { id: 'm1', name: 'Anna' } },
  );

  assert.equal(ergebnis.ok, false);
  assert.equal(ergebnis.grund, 'Dem Bot fehlt das Recht.');
  assert.equal(ergebnis.gelaufen, 1);
  assert.deepEqual(spur.map((s) => s.name), ['eins', 'zwei']);

  const [eintrag] = protokoll.eintraege;
  assert.equal(eintrag.ergebnis, 'fehler');
  assert.equal(eintrag.betreff, 'Los');
  assert.match(eintrag.klartext, /Aktion 2 von 3 scheiterte: Dem Bot fehlt das Recht\./);
  assert.equal(eintrag.akteur.id, 'm1');
});

test('eine unbekannte Aktionsart wird sauber abgelehnt', async () => {
  const { kette, protokoll } = baue({ eins: gelingt([], 'eins') });

  const ergebnis = await kette.fuehreAus(
    { beschriftung: 'Alt', aktionen: [{ art: 'gibt-es-nicht' }] },
    { mitglied: { id: 'm1', name: 'Anna' } },
  );

  assert.equal(ergebnis.ok, false);
  assert.match(ergebnis.grund, /kennt das Panel nicht/);
  assert.match(ergebnis.grund, /gibt-es-nicht/);
  assert.equal(ergebnis.gelaufen, 0);
  assert.equal(protokoll.eintraege.length, 1);
});

test('eine Aktion ganz ohne Art wird ebenfalls abgelehnt', async () => {
  const { kette } = baue({});

  const ergebnis = await kette.fuehreAus({ aktionen: [{}] }, { mitglied: { id: 'm1' } });

  assert.equal(ergebnis.ok, false);
  assert.match(ergebnis.grund, /ohne Art/);
});

test('wirft eine Aktion, wird der Grund verständlich gemeldet und geloggt', async () => {
  const { kette, logger, protokoll } = baue({
    kaputt: wirft(new Error('TypeError: undefined is not a function')),
  });

  const ergebnis = await kette.fuehreAus(
    { beschriftung: 'Los', aktionen: [{ art: 'kaputt' }] },
    { mitglied: { id: 'm1' } },
  );

  assert.equal(ergebnis.ok, false);
  // Dem Klickenden nicht die Ausnahme vorsetzen.
  assert.equal(ergebnis.grund, 'Da ist etwas schiefgegangen.');
  assert.doesNotMatch(ergebnis.grund, /TypeError/);
  assert.equal(logger.gesammelt.length, 1, 'Der echte Fehler wurde nicht geloggt');
  assert.equal(protokoll.eintraege.length, 1);
});

test('ein KettenFehler trägt seine eigene Meldung nach aussen', async () => {
  // Damit eine Aktionsart etwas Verständliches sagen kann, ohne ein
  // ok:false-Objekt zurückgeben zu müssen.
  const { kette } = baue({
    kaputt: wirft(new KettenFehler('Diese Person ist nicht mehr auf dem Server.')),
  });

  const ergebnis = await kette.fuehreAus({ aktionen: [{ art: 'kaputt' }] }, { mitglied: { id: 'm1' } });

  assert.equal(ergebnis.grund, 'Diese Person ist nicht mehr auf dem Server.');
});

test('eine Aktion ohne Grund bekommt einen verständlichen Ersatz', async () => {
  const { kette } = baue({ still: { async fuehreAus() { return { ok: false }; } } });

  const ergebnis = await kette.fuehreAus({ aktionen: [{ art: 'still' }] }, { mitglied: { id: 'm1' } });

  assert.equal(ergebnis.grund, 'Die Aktion konnte nicht ausgeführt werden.');
});

test('eine Aktion, die gar nichts zurückgibt, gilt als gescheitert', async () => {
  const { kette } = baue({ leer: { async fuehreAus() { /* nichts */ } } });

  const ergebnis = await kette.fuehreAus({ aktionen: [{ art: 'leer' }] }, { mitglied: { id: 'm1' } });

  assert.equal(ergebnis.ok, false);
  assert.equal(ergebnis.gelaufen, 0);
});

test('Werte einer Aktion stehen den folgenden zur Verfügung', async () => {
  // Genau das braucht Schritt 50: die Antwort aus dem Eingabefenster in der
  // nachfolgenden Direktnachricht.
  const spur = [];
  const { kette } = baue({
    fragt: gelingt(spur, 'fragt', { werte: { feedback: 'Mir gefällt der Server' } }),
    schickt: gelingt(spur, 'schickt'),
  });

  await kette.fuehreAus(
    { aktionen: [{ art: 'fragt' }, { art: 'schickt' }] },
    { mitglied: { id: 'm1' } },
  );

  assert.deepEqual(spur[1].werte, { feedback: 'Mir gefällt der Server' });
  assert.deepEqual(spur[0].werte, {}, 'Die erste Aktion sah schon Werte');
});

test('mitgegebene Werte aus dem Kontext stehen von Anfang an bereit', async () => {
  const spur = [];
  const { kette } = baue({ eins: gelingt(spur, 'eins') });

  await kette.fuehreAus(
    { aktionen: [{ art: 'eins' }] },
    { mitglied: { id: 'm1' }, werte: { user: 'Anna' } },
  );

  assert.deepEqual(spur[0].werte, { user: 'Anna' });
});

test('Meldungen werden gesammelt und nicht überschrieben', async () => {
  const spur = [];
  const { kette } = baue({
    eins: gelingt(spur, 'eins', { meldung: 'Rolle vergeben.' }),
    zwei: gelingt(spur, 'zwei', { meldung: 'Nachricht ist unterwegs.' }),
    drei: gelingt(spur, 'drei'),
  });

  const ergebnis = await kette.fuehreAus(
    { aktionen: [{ art: 'eins' }, { art: 'zwei' }, { art: 'drei' }] },
    { mitglied: { id: 'm1' } },
  );

  assert.deepEqual(ergebnis.meldungen, ['Rolle vergeben.', 'Nachricht ist unterwegs.']);
});

test('Meldungen bis zum Abbruch bleiben erhalten', async () => {
  const spur = [];
  const { kette } = baue({
    eins: gelingt(spur, 'eins', { meldung: 'Rolle vergeben.' }),
    zwei: scheitert(spur, 'zwei', 'Ging nicht.'),
  });

  const ergebnis = await kette.fuehreAus(
    { aktionen: [{ art: 'eins' }, { art: 'zwei' }] },
    { mitglied: { id: 'm1' } },
  );

  // Was schon passiert ist, soll der Klickende auch erfahren.
  assert.deepEqual(ergebnis.meldungen, ['Rolle vergeben.']);
  assert.equal(ergebnis.grund, 'Ging nicht.');
});

test('ein Knopf ohne Aktionen läuft durch, ohne etwas zu tun', async () => {
  const { kette, protokoll } = baue({});

  const ergebnis = await kette.fuehreAus({ beschriftung: 'Leer' }, { mitglied: { id: 'm1' } });

  assert.deepEqual(ergebnis, { ok: true, meldungen: [], grund: null, gelaufen: 0 });
  assert.equal(protokoll.eintraege.length, 0);
});

test('auch ohne Knopf und ohne Kontext stürzt nichts ab', async () => {
  const { kette } = baue({});

  const ergebnis = await kette.fuehreAus();

  assert.equal(ergebnis.ok, true);
  assert.equal(ergebnis.gelaufen, 0);
});
