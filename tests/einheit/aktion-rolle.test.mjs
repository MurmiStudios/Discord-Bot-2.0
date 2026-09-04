import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { oeffneDatenbank } from '../../src/daten/db.mjs';
import { migriere, ladeMigrationen } from '../../src/daten/migrieren.mjs';
import { erstelleGilden } from '../../src/daten/gilden.mjs';
import { erstelleProtokoll } from '../../src/protokoll/protokoll.mjs';
import { erstelleLogger } from '../../src/kern/logger.mjs';
import { erstelleBot } from '../../src/discord/bot.mjs';
import { erstelleGildenAnsicht } from '../../src/discord/gilde.mjs';
import { erstelleRollenVerwalter } from '../../src/discord/rollen.mjs';
import { erstelleRollenAktion, ART } from '../../src/aktionen/arten/rolle.mjs';
import { erstelleClientDoppel, RECHT } from '../hilfen/discord-doppel.mjs';
import { mitTempVerzeichnis } from '../hilfen/db.mjs';

const GILDE = '111111111111111111';
const KONFIG = {
  token: 'x'.repeat(40), clientId: '1', clientSecret: 'y'.repeat(40),
  guildId: GILDE, ownerId: '4242', sessionSecret: 'z'.repeat(64),
  dmMaxEmpfaenger: 100, dmPauseMs: 0,
};

async function mitAktion(fn, { rollenFehler = {}, botRechte, rollen } = {}) {
  return mitTempVerzeichnis(async (dir) => {
    const db = oeffneDatenbank(join(dir, 'panel.db'));
    migriere(db, ladeMigrationen(new URL('../../src/daten/migrationen/', import.meta.url).pathname));
    erstelleGilden(db).merke(GILDE, 'Mein Server');

    const doppel = erstelleClientDoppel({
      guildId: GILDE,
      botRolleposition: 10,
      ...(botRechte ? { botRechte } : {}),
      rollen: rollen ?? [
        { id: 'r-mitglied', name: 'Mitglied', position: 3 },
        { id: 'r-gast', name: 'Gast', position: 2 },
        { id: 'r-chef', name: 'Chef', position: 20 },
        { id: 'r-nitro', name: 'Nitro', position: 4, managed: true },
      ],
      mitglieder: [{ id: 'm1', name: 'Anna', rollen: ['r-gast'] }],
      rollenFehler,
    });

    const zeilen = [];
    const logger = erstelleLogger({ schreibe: (z) => zeilen.push(z) });
    const bot = erstelleBot({ konfig: KONFIG, logger, erzeugeClient: () => doppel.client });
    await bot.verbinde();
    await new Promise((f) => setTimeout(f, 0));

    const protokoll = erstelleProtokoll(db);
    const aktion = erstelleRollenAktion({
      gildenAnsicht: erstelleGildenAnsicht({ bot, konfig: KONFIG }),
      rollenVerwalter: erstelleRollenVerwalter({ bot, konfig: KONFIG }),
      protokoll, logger, konfig: KONFIG,
    });

    try {
      return await fn({ aktion, doppel, protokoll, logzeilen: zeilen });
    } finally {
      db.close();
    }
  });
}

/** Anna, so wie der Klick sie liefert: mit dem Stand ihrer Rollen. */
const anna = (rollenIds = ['r-gast']) => ({ id: 'm1', name: 'Anna', tag: 'anna', rollenIds });

test('die Art heisst so, wie die gespeicherte Leiste sie nennt', () => {
  assert.equal(ART, 'rolle');
});

test('der Knopf gibt die Rolle und meldet es', async () => {
  await mitAktion(async (u) => {
    const ergebnis = await u.aktion.fuehreAus(
      { art: 'rolle', richtung: 'geben', rolleId: 'r-mitglied' },
      { mitglied: anna() },
    );

    assert.equal(ergebnis.ok, true);
    assert.deepEqual(u.doppel.vergeben.map((v) => v.rolle), ['r-mitglied']);
    assert.match(ergebnis.meldung, /Mitglied/);
  });
});

test('der Rollenname geht als {role} an die folgenden Aktionen', async () => {
  // Damit eine Kette „Rolle geben → Nachricht senden“ die Rolle beim Namen
  // nennen kann, ohne dass er zweimal getippt wird.
  await mitAktion(async (u) => {
    const ergebnis = await u.aktion.fuehreAus(
      { art: 'rolle', richtung: 'geben', rolleId: 'r-mitglied' },
      { mitglied: anna() },
    );

    assert.deepEqual(ergebnis.werte, { role: 'Mitglied' });
  });
});

test('der Knopf nimmt die Rolle wieder weg', async () => {
  await mitAktion(async (u) => {
    const ergebnis = await u.aktion.fuehreAus(
      { art: 'rolle', richtung: 'nehmen', rolleId: 'r-gast' },
      { mitglied: anna(['r-gast']) },
    );

    assert.equal(ergebnis.ok, true);
    assert.deepEqual(u.doppel.entzogen.map((v) => v.rolle), ['r-gast']);
    assert.equal(u.doppel.vergeben.length, 0);
  });
});

test('hat jemand die Rolle schon, wird sie nicht noch einmal vergeben', async () => {
  // Sonst stünde im Protokoll „gegeben“, obwohl sich nichts geändert hat.
  await mitAktion(async (u) => {
    const ergebnis = await u.aktion.fuehreAus(
      { art: 'rolle', richtung: 'geben', rolleId: 'r-gast' },
      { mitglied: anna(['r-gast']) },
    );

    assert.equal(ergebnis.ok, true);
    assert.match(ergebnis.meldung, /bereits/);
    assert.equal(u.doppel.vergeben.length, 0);
    assert.equal(u.protokoll.lies(GILDE).eintraege.length, 0);
    assert.deepEqual(ergebnis.werte, { role: 'Gast' }, '{role} steht trotzdem bereit');
  });
});

test('eine Rolle, die jemand gar nicht hat, wird nicht entzogen', async () => {
  await mitAktion(async (u) => {
    const ergebnis = await u.aktion.fuehreAus(
      { art: 'rolle', richtung: 'nehmen', rolleId: 'r-mitglied' },
      { mitglied: anna(['r-gast']) },
    );

    assert.equal(ergebnis.ok, true);
    assert.equal(u.doppel.entzogen.length, 0);
  });
});

test('eine Rolle über der Bot-Rolle wird beim Klick abgelehnt, nicht versucht', async () => {
  // Discord liesse den Bot ohnehin nicht heran. Der Grund gehört gesagt.
  await mitAktion(async (u) => {
    const ergebnis = await u.aktion.fuehreAus(
      { art: 'rolle', richtung: 'geben', rolleId: 'r-chef' },
      { mitglied: anna() },
    );

    assert.equal(ergebnis.ok, false);
    assert.match(ergebnis.grund, /über der Rolle des Bots/);
    assert.equal(u.doppel.vergeben.length, 0);
  });
});

test('eine von einer Integration verwaltete Rolle wird abgelehnt', async () => {
  await mitAktion(async (u) => {
    const ergebnis = await u.aktion.fuehreAus(
      { art: 'rolle', richtung: 'geben', rolleId: 'r-nitro' },
      { mitglied: anna() },
    );

    assert.equal(ergebnis.ok, false);
    assert.match(ergebnis.grund, /Integration/);
  });
});

test('fehlt dem Bot das Rollenrecht, sagt der Grund das', async () => {
  await mitAktion(
    async (u) => {
      const ergebnis = await u.aktion.fuehreAus(
        { art: 'rolle', richtung: 'geben', rolleId: 'r-mitglied' },
        { mitglied: anna() },
      );

      assert.equal(ergebnis.ok, false);
      assert.match(ergebnis.grund, /Recht/);
    },
    { botRechte: [RECHT.KANAL_SEHEN, RECHT.NACHRICHTEN_SENDEN] },
  );
});

test('eine gelöschte Rolle ergibt einen Grund, keinen Absturz', async () => {
  await mitAktion(async (u) => {
    const ergebnis = await u.aktion.fuehreAus(
      { art: 'rolle', richtung: 'geben', rolleId: 'r-weg' },
      { mitglied: anna() },
    );

    assert.equal(ergebnis.ok, false);
    assert.match(ergebnis.grund, /gibt es auf dem Server nicht mehr/);
  });
});

test('scheitert Discord beim Vergeben, steht der Grund im Klartext', async () => {
  await mitAktion(
    async (u) => {
      const ergebnis = await u.aktion.fuehreAus(
        { art: 'rolle', richtung: 'geben', rolleId: 'r-mitglied' },
        { mitglied: anna() },
      );

      assert.equal(ergebnis.ok, false);
      assert.ok(ergebnis.grund.length > 0);
      assert.equal(u.protokoll.lies(GILDE).eintraege.length, 0, 'kein Erfolg im Protokoll');
      assert.ok(u.logzeilen.some((z) => z.includes('Rolle nicht geändert')));
    },
    { rollenFehler: { 'r-mitglied': Object.assign(new Error('Missing Permissions'), { code: 50013 }) } },
  );
});

test('der Erfolg steht im Protokoll, mit Richtung und Rollenname', async () => {
  await mitAktion(async (u) => {
    await u.aktion.fuehreAus(
      { art: 'rolle', richtung: 'geben', rolleId: 'r-mitglied' }, { mitglied: anna() },
    );

    const [eintrag] = u.protokoll.lies(GILDE).eintraege;
    assert.equal(eintrag.art, 'aktion.rolle.gegeben');
    assert.match(eintrag.klartext, /„Mitglied“ per Knopfdruck gegeben/);
  });
});

test('ohne Mitglied im Kontext passiert nichts', async () => {
  await mitAktion(async (u) => {
    const ergebnis = await u.aktion.fuehreAus(
      { art: 'rolle', richtung: 'geben', rolleId: 'r-mitglied' }, {},
    );

    assert.equal(ergebnis.ok, false);
    assert.equal(u.doppel.vergeben.length, 0);
  });
});

test('kennt der Kontext die Rollen nicht, wird trotzdem gehandelt', async () => {
  // Lieber einmal zu viel an Discord geschickt — Discord nimmt es klaglos an —
  // als eine Rolle, die nie ankommt, weil der Stand unbekannt war.
  await mitAktion(async (u) => {
    const ergebnis = await u.aktion.fuehreAus(
      { art: 'rolle', richtung: 'geben', rolleId: 'r-mitglied' },
      { mitglied: { id: 'm1', name: 'Anna', tag: 'anna' } },
    );

    assert.equal(ergebnis.ok, true);
    assert.deepEqual(u.doppel.vergeben.map((v) => v.rolle), ['r-mitglied']);
  });
});
