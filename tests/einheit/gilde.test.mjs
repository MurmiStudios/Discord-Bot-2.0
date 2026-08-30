import { test } from 'node:test';
import assert from 'node:assert/strict';
import { erstelleBot } from '../../src/discord/bot.mjs';
import { erstelleGildenAnsicht } from '../../src/discord/gilde.mjs';
import { darfBot, AKTION } from '../../src/discord/rechte.mjs';
import { erstelleLogger } from '../../src/kern/logger.mjs';
import { erstelleClientDoppel, KANALART, RECHT } from '../hilfen/discord-doppel.mjs';

const GILDE = '111111111111111111';
const stillerLogger = erstelleLogger({ schreibe: () => {} });

/** Verbundener Bot samt Ansicht auf einen erfundenen Server. */
async function mitGilde(optionen = {}) {
  const { client } = erstelleClientDoppel({ guildId: GILDE, ...optionen });
  const bot = erstelleBot({
    konfig: { token: 'x'.repeat(40), guildId: GILDE },
    logger: stillerLogger,
    erzeugeClient: () => client,
  });
  await bot.verbinde();
  await new Promise((f) => setTimeout(f, 0));
  return { bot, ansicht: erstelleGildenAnsicht({ bot, konfig: { guildId: GILDE } }) };
}

const KANAELE = [
  { id: 'kat1', name: 'Allgemein', type: KANALART.KATEGORIE },
  { id: 'k1', name: 'willkommen', type: KANALART.TEXT, parentId: 'kat1', position: 0 },
  { id: 'k2', name: 'news', type: KANALART.ANKUENDIGUNG, parentId: 'kat1', position: 1 },
  { id: 'k3', name: 'nur-lesen', type: KANALART.TEXT, parentId: 'kat1', botDarf: [RECHT.KANAL_SEHEN] },
  { id: 'k4', name: 'sprachkanal', type: KANALART.SPRACHE, parentId: 'kat1' },
  { id: 'k5', name: 'ohne-kategorie', type: KANALART.TEXT },
];

const ROLLEN = [
  { id: 'r-niedrig', name: 'Neu', position: 2 },
  { id: 'r-hoch', name: 'Admin', position: 20 },
  { id: 'r-verwaltet', name: 'Nitro Booster', position: 3, managed: true },
];

const MITGLIEDER = [
  { id: 'm1', name: 'Anna', rollen: ['r-niedrig'] },
  { id: 'm2', name: 'Bert', rollen: ['r-niedrig', 'r-hoch'] },
  { id: 'm3', name: 'Clara', rollen: [] },
];

test('die Kanalliste enthält Text-, Ankündigungs- und Thread-Kanäle', async () => {
  const { ansicht } = await mitGilde({ kanaele: KANAELE });

  const namen = ansicht.kanaele().map((k) => k.name);
  assert.ok(namen.includes('willkommen'));
  assert.ok(namen.includes('news'));
});

test('Sprach- und Kategoriekanäle stehen nicht zur Auswahl — dort schreibt niemand', async () => {
  const { ansicht } = await mitGilde({ kanaele: KANAELE });

  const namen = ansicht.kanaele().map((k) => k.name);
  assert.ok(!namen.includes('sprachkanal'));
  assert.ok(!namen.includes('Allgemein'));
});

test('jeder Kanal kennt seine Kategorie, auch wenn er keine hat', async () => {
  const { ansicht } = await mitGilde({ kanaele: KANAELE });
  const kanaele = ansicht.kanaele();

  assert.equal(kanaele.find((k) => k.id === 'k1').kategorieName, 'Allgemein');
  assert.equal(kanaele.find((k) => k.id === 'k5').kategorieName, null);
});

test('die Kanalart wird benannt, damit die Oberfläche das richtige Symbol wählt', async () => {
  const { ansicht } = await mitGilde({ kanaele: KANAELE });
  const kanaele = ansicht.kanaele();

  assert.equal(kanaele.find((k) => k.id === 'k1').art, 'text');
  assert.equal(kanaele.find((k) => k.id === 'k2').art, 'ankuendigung');
});

test('ein Kanal ohne Schreibrecht ist gesperrt und nennt den Grund', async () => {
  const { ansicht } = await mitGilde({ kanaele: KANAELE });

  const gesperrt = ansicht.kanaele().find((k) => k.id === 'k3');
  assert.equal(gesperrt.darfSchreiben, false);
  assert.match(gesperrt.sperrgrund, /Schreibrecht|schreiben/i);
});

test('ein Kanal mit Schreibrecht ist nicht gesperrt', async () => {
  const { ansicht } = await mitGilde({ kanaele: KANAELE });

  const offen = ansicht.kanaele().find((k) => k.id === 'k1');
  assert.equal(offen.darfSchreiben, true);
  assert.equal(offen.sperrgrund, null);
});

test('die Rollenliste lässt die Bot-Rolle selbst weg', async () => {
  const { ansicht } = await mitGilde({ rollen: ROLLEN });

  assert.ok(!ansicht.rollen().some((r) => r.id === 'bot-rolle'));
});

test('eine Rolle über der Bot-Rolle ist gesperrt und nennt den Grund', async () => {
  const { ansicht } = await mitGilde({ rollen: ROLLEN, botRolleposition: 10 });

  const hoch = ansicht.rollen().find((r) => r.id === 'r-hoch');
  assert.equal(hoch.vergebbar, false);
  assert.match(hoch.sperrgrund, /über der Rolle des Bots/i);
});

test('eine von einer Integration verwaltete Rolle ist gesperrt', async () => {
  const { ansicht } = await mitGilde({ rollen: ROLLEN });

  const verwaltet = ansicht.rollen().find((r) => r.id === 'r-verwaltet');
  assert.equal(verwaltet.vergebbar, false);
  assert.match(verwaltet.sperrgrund, /Integration/i);
});

test('eine niedrigere, freie Rolle ist vergebbar', async () => {
  const { ansicht } = await mitGilde({ rollen: ROLLEN });

  const niedrig = ansicht.rollen().find((r) => r.id === 'r-niedrig');
  assert.equal(niedrig.vergebbar, true);
  assert.equal(niedrig.sperrgrund, null);
});

test('fehlt dem Bot das Recht, Rollen zu verwalten, ist jede Rolle gesperrt', async () => {
  const { ansicht } = await mitGilde({ rollen: ROLLEN, botRechte: [RECHT.KANAL_SEHEN] });

  for (const rolle of ansicht.rollen()) {
    assert.equal(rolle.vergebbar, false, `${rolle.name} gilt als vergebbar`);
    assert.match(rolle.sperrgrund, /Recht/i);
  }
});

test('die Rollen eines Mitglieds lassen sich abfragen', async () => {
  const { ansicht } = await mitGilde({ rollen: ROLLEN, mitglieder: MITGLIEDER });

  assert.deepEqual(ansicht.rollenVon(GILDE, 'm2').sort(), ['r-hoch', 'r-niedrig']);
  assert.deepEqual(ansicht.rollenVon(GILDE, 'm3'), []);
});

test('für ein Nichtmitglied gibt es keine Rollenliste — und das ist etwas anderes als keine Rollen', async () => {
  const { ansicht } = await mitGilde({ mitglieder: MITGLIEDER });

  assert.equal(ansicht.rollenVon(GILDE, 'unbekannt'), undefined);
});

test('ohne verbundenen Bot gibt es keine Rollenliste statt eines Absturzes', async () => {
  const { client } = erstelleClientDoppel({ guildId: GILDE });
  const bot = erstelleBot({
    konfig: { token: 'x'.repeat(40), guildId: GILDE },
    logger: stillerLogger,
    erzeugeClient: () => client,
  });
  const ansicht = erstelleGildenAnsicht({ bot, konfig: { guildId: GILDE } });

  assert.equal(ansicht.rollenVon(GILDE, 'm1'), undefined);
  assert.deepEqual(ansicht.kanaele(), []);
  assert.deepEqual(ansicht.rollen(), []);
});

test('die Mitgliedersuche findet nach Namensteil und lässt Bots weg', async () => {
  const { ansicht } = await mitGilde({
    mitglieder: [...MITGLIEDER, { id: 'm4', name: 'Annabot', bot: true }],
  });

  const treffer = ansicht.sucheMitglieder('ann');
  assert.deepEqual(treffer.map((m) => m.name), ['Anna']);
});

test('die Suche ohne Suchbegriff gibt alle Mitglieder zurück', async () => {
  const { ansicht } = await mitGilde({ mitglieder: MITGLIEDER });

  assert.equal(ansicht.sucheMitglieder('').length, 3);
});

test('Kicken ist möglich, wenn der Bot das Recht hat', async () => {
  const { ansicht } = await mitGilde({
    rollen: ROLLEN,
    mitglieder: MITGLIEDER,
    botRechte: [RECHT.MITGLIEDER_KICKEN, RECHT.ROLLEN_VERWALTEN],
  });

  const urteil = darfBot(AKTION.KICKEN, { ansicht });
  assert.equal(urteil.erlaubt, true);
});

test('fehlt das Kick-Recht, sagt die Vorprüfung das vorher und nennt es', async () => {
  const { ansicht } = await mitGilde({ rollen: ROLLEN, botRechte: [RECHT.KANAL_SEHEN] });

  const urteil = darfBot(AKTION.KICKEN, { ansicht });
  assert.equal(urteil.erlaubt, false);
  assert.match(urteil.grund, /kicken|Mitglieder entfernen/i);
});

test('eine Rolle über der Bot-Rolle lässt sich nicht vergeben', async () => {
  const { ansicht } = await mitGilde({ rollen: ROLLEN });

  const urteil = darfBot(AKTION.ROLLE_VERGEBEN, { ansicht, rollenId: 'r-hoch' });
  assert.equal(urteil.erlaubt, false);
  assert.match(urteil.grund, /über der Rolle des Bots/i);
});

test('eine unbekannte Rolle lässt sich nicht vergeben', async () => {
  const { ansicht } = await mitGilde({ rollen: ROLLEN });

  const urteil = darfBot(AKTION.ROLLE_VERGEBEN, { ansicht, rollenId: 'gibt-es-nicht' });
  assert.equal(urteil.erlaubt, false);
  assert.match(urteil.grund, /nicht/i);
});

test('in einen gesperrten Kanal darf nicht geschrieben werden', async () => {
  const { ansicht } = await mitGilde({ kanaele: KANAELE });

  assert.equal(darfBot(AKTION.IN_KANAL_SCHREIBEN, { ansicht, kanalId: 'k3' }).erlaubt, false);
  assert.equal(darfBot(AKTION.IN_KANAL_SCHREIBEN, { ansicht, kanalId: 'k1' }).erlaubt, true);
});

test('ein Kanal, den es nicht gibt, ist kein Schreibziel', async () => {
  const { ansicht } = await mitGilde({ kanaele: KANAELE });

  const urteil = darfBot(AKTION.IN_KANAL_SCHREIBEN, { ansicht, kanalId: 'gibt-es-nicht' });
  assert.equal(urteil.erlaubt, false);
  assert.match(urteil.grund, /nicht/i);
});
