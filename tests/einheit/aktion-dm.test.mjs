import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { oeffneDatenbank } from '../../src/daten/db.mjs';
import { migriere, ladeMigrationen } from '../../src/daten/migrieren.mjs';
import { erstelleGilden } from '../../src/daten/gilden.mjs';
import { erstelleNachrichtenAblage } from '../../src/daten/nachrichten.mjs';
import { erstelleProtokoll } from '../../src/protokoll/protokoll.mjs';
import { erstelleLogger } from '../../src/kern/logger.mjs';
import { erstelleBot } from '../../src/discord/bot.mjs';
import { erstelleGildenAnsicht } from '../../src/discord/gilde.mjs';
import { erstelleVersender } from '../../src/discord/versender.mjs';
import { erstelleDmAktion, ART } from '../../src/aktionen/arten/dm.mjs';
import { erstelleClientDoppel } from '../hilfen/discord-doppel.mjs';
import { mitTempVerzeichnis } from '../hilfen/db.mjs';

const GILDE = '111111111111111111';
const KONFIG = {
  token: 'x'.repeat(40), clientId: '1', clientSecret: 'y'.repeat(40),
  guildId: GILDE, ownerId: '4242', sessionSecret: 'z'.repeat(64),
  dmMaxEmpfaenger: 100, dmPauseMs: 0,
};

const ANNA = { id: 'm1', name: 'Anna', tag: 'anna' };

async function mitAktion(fn, { dmFehler = {} } = {}) {
  return mitTempVerzeichnis(async (dir) => {
    const db = oeffneDatenbank(join(dir, 'panel.db'));
    migriere(db, ladeMigrationen(new URL('../../src/daten/migrationen/', import.meta.url).pathname));
    erstelleGilden(db).merke(GILDE, 'Mein Server');

    const doppel = erstelleClientDoppel({
      guildId: GILDE,
      gildenName: 'Mein Server',
      mitglieder: [{ id: 'm1', name: 'Anna', rollen: [] }],
      dmFehler,
    });

    const zeilen = [];
    const logger = erstelleLogger({ schreibe: (z) => zeilen.push(z) });
    const bot = erstelleBot({ konfig: KONFIG, logger, erzeugeClient: () => doppel.client });
    await bot.verbinde();
    await new Promise((f) => setTimeout(f, 0));

    const nachrichtenAblage = erstelleNachrichtenAblage(db);
    const protokoll = erstelleProtokoll(db);
    const versender = erstelleVersender({
      bot, konfig: KONFIG, gildenAnsicht: erstelleGildenAnsicht({ bot, konfig: KONFIG }),
    });

    const aktion = erstelleDmAktion({
      nachrichtenAblage, versender, protokoll, logger, konfig: KONFIG,
    });

    try {
      return await fn({ aktion, nachrichtenAblage, protokoll, doppel, logzeilen: zeilen });
    } finally {
      db.close();
    }
  });
}

const lege = (ablage, daten, name = 'Regeln') =>
  ablage.lege(GILDE, { name, art: 'dm', daten });

test('die Art heisst so, wie die gespeicherte Leiste sie nennt', () => {
  assert.equal(ART, 'dm');
});

test('der Knopf schickt die gespeicherte Nachricht an den Klickenden', async () => {
  await mitAktion(async (u) => {
    const id = lege(u.nachrichtenAblage, { art: 'dm', text: 'Hallo {user}, willkommen auf {guild}!' });

    const ergebnis = await u.aktion.fuehreAus({ art: 'dm', nachrichtId: id }, { mitglied: ANNA });

    assert.equal(ergebnis.ok, true);
    assert.equal(u.doppel.gesendet.length, 1);
    assert.equal(u.doppel.gesendet[0].art, 'dm');
    assert.equal(u.doppel.gesendet[0].ziel, 'm1');
    assert.equal(u.doppel.gesendet[0].nutzlast.content, 'Hallo Anna, willkommen auf Mein Server!');
  });
});

test('Werte aus vorherigen Aktionen stehen als Platzhalter zur Verfügung', async () => {
  // Daran hängt Schritt 50: Die Antwort aus einem Eingabefenster soll in der
  // Nachricht landen, die danach rausgeht.
  await mitAktion(async (u) => {
    const id = lege(u.nachrichtenAblage, { art: 'dm', text: 'Deine Rolle: {role}' });

    await u.aktion.fuehreAus(
      { art: 'dm', nachrichtId: id },
      { mitglied: ANNA, werte: { role: 'Verifiziert' } },
    );

    assert.equal(u.doppel.gesendet[0].nutzlast.content, 'Deine Rolle: Verifiziert');
  });
});

test('der Erfolg steht im Protokoll, mit dem Namen der Nachricht', async () => {
  await mitAktion(async (u) => {
    const id = lege(u.nachrichtenAblage, { art: 'dm', text: 'Hallo' }, 'Serverregeln');

    await u.aktion.fuehreAus({ art: 'dm', nachrichtId: id }, { mitglied: ANNA });

    const eintraege = u.protokoll.lies(GILDE).eintraege;
    assert.equal(eintraege.length, 1);
    assert.equal(eintraege[0].art, 'aktion.dm');
    assert.match(eintraege[0].klartext, /Serverregeln/);
  });
});

test('eine gelöschte Nachricht ergibt einen Grund, keinen Absturz', async () => {
  await mitAktion(async (u) => {
    const id = lege(u.nachrichtenAblage, { art: 'dm', text: 'Hallo' });
    u.nachrichtenAblage.loesche(GILDE, id);

    const ergebnis = await u.aktion.fuehreAus({ art: 'dm', nachrichtId: id }, { mitglied: ANNA });

    assert.equal(ergebnis.ok, false);
    assert.match(ergebnis.grund, /gibt es nicht mehr/);
    assert.equal(u.doppel.gesendet.length, 0);
  });
});

test('eine Nachricht ohne Inhalt wird nicht verschickt', async () => {
  await mitAktion(async (u) => {
    const id = lege(u.nachrichtenAblage, { art: 'dm', text: '' }, 'Leer');

    const ergebnis = await u.aktion.fuehreAus({ art: 'dm', nachrichtId: id }, { mitglied: ANNA });

    assert.equal(ergebnis.ok, false);
    assert.match(ergebnis.grund, /Leer/);
    assert.equal(u.doppel.gesendet.length, 0);
  });
});

test('nimmt jemand keine Direktnachrichten an, steht das im Klartext im Grund', async () => {
  await mitAktion(
    async (u) => {
      const id = lege(u.nachrichtenAblage, { art: 'dm', text: 'Hallo' });

      const ergebnis = await u.aktion.fuehreAus({ art: 'dm', nachrichtId: id }, { mitglied: ANNA });

      assert.equal(ergebnis.ok, false);
      assert.match(ergebnis.grund, /Direktnachricht/i);
      assert.equal(ergebnis.grund.includes('50007'), false, 'ohne Discords Fehlernummer');
    },
    { dmFehler: { m1: Object.assign(new Error('Cannot send messages to this user'), { code: 50007 }) } },
  );
});

test('ohne Mitglied im Kontext passiert nichts', async () => {
  await mitAktion(async (u) => {
    const id = lege(u.nachrichtenAblage, { art: 'dm', text: 'Hallo' });

    const ergebnis = await u.aktion.fuehreAus({ art: 'dm', nachrichtId: id }, {});

    assert.equal(ergebnis.ok, false);
    assert.equal(u.doppel.gesendet.length, 0);
  });
});

test('eine unsinnige Kennung ergibt einen Grund statt einer Abfrage', async () => {
  await mitAktion(async (u) => {
    const ergebnis = await u.aktion.fuehreAus(
      { art: 'dm', nachrichtId: 'keine-zahl' }, { mitglied: ANNA },
    );

    assert.equal(ergebnis.ok, false);
    assert.equal(u.doppel.gesendet.length, 0);
  });
});
