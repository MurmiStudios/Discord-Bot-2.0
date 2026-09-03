import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { oeffneDatenbank } from '../../src/daten/db.mjs';
import { migriere, ladeMigrationen } from '../../src/daten/migrieren.mjs';
import { erstelleGilden } from '../../src/daten/gilden.mjs';
import { erstelleRollenregeln } from '../../src/daten/rollenregeln.mjs';
import { erstelleProtokoll } from '../../src/protokoll/protokoll.mjs';
import { erstelleLogger } from '../../src/kern/logger.mjs';
import { erstelleBot } from '../../src/discord/bot.mjs';
import { erstelleGildenAnsicht } from '../../src/discord/gilde.mjs';
import { erstelleRollenVerwalter } from '../../src/discord/rollen.mjs';
import { erstelleRollenregelAutomatik, pruefeEntzug } from '../../src/automatik/rollenregel.mjs';
import { registriereEreignisse } from '../../src/discord/ereignisse.mjs';
import { erstelleClientDoppel } from '../hilfen/discord-doppel.mjs';
import { mitTempVerzeichnis } from '../hilfen/db.mjs';

const GILDE = '111111111111111111';

const KONFIG = {
  token: 'x'.repeat(40), clientId: '1', clientSecret: 'y'.repeat(40),
  guildId: GILDE, ownerId: '4242', sessionSecret: 'z'.repeat(64), dmPauseMs: 0,
};

/** Der Bot steht auf Position 10. */
const ROLLEN = [
  { id: 'r-neu', name: 'Neu', position: 2 },
  { id: 'r-verifiziert', name: 'Verifiziert', position: 3 },
  { id: 'r-gast', name: 'Gast', position: 4 },
];

async function mitBot(fn, { rollen = ROLLEN, rollenFehler = {}, mitglieder } = {}) {
  return mitTempVerzeichnis(async (dir) => {
    const db = oeffneDatenbank(join(dir, 'panel.db'));
    migriere(db, ladeMigrationen(new URL('../../src/daten/migrationen/', import.meta.url).pathname));
    erstelleGilden(db).merke(GILDE, 'Mein Server');

    const doppel = erstelleClientDoppel({
      guildId: GILDE, gildenName: 'Mein Server', botRolleposition: 10,
      rollen,
      mitglieder: mitglieder ?? [{ id: 'm1', name: 'Anna', rollen: ['r-neu', 'r-gast'] }],
      rollenFehler,
    });

    const zeilen = [];
    const logger = erstelleLogger({ schreibe: (z) => zeilen.push(z) });
    const bot = erstelleBot({ konfig: KONFIG, logger, erzeugeClient: () => doppel.client });
    await bot.verbinde();
    await new Promise((f) => setTimeout(f, 0));

    const gildenAnsicht = erstelleGildenAnsicht({ bot, konfig: KONFIG });
    const rollenregeln = erstelleRollenregeln(db);
    const protokoll = erstelleProtokoll(db);

    const automatik = erstelleRollenregelAutomatik({
      rollenregeln, gildenAnsicht,
      rollenVerwalter: erstelleRollenVerwalter({ bot, konfig: KONFIG }),
      protokoll, logger, konfig: KONFIG,
    });

    const wartend = [];
    registriereEreignisse(doppel.client, {
      konfig: KONFIG, logger,
      beiRollenerhalt: (m, neue) => {
        const lauf = automatik.beiRollenerhalt(m, neue);
        wartend.push(lauf);
        return lauf;
      },
    });

    try {
      return await fn({
        doppel, rollenregeln, protokoll, automatik, gildenAnsicht, logzeilen: zeilen,
        aendere: async (angaben) => {
          doppel.loeseRollenaenderungAus(angaben);
          await Promise.all(wartend);
        },
      });
    } finally {
      db.close();
    }
  });
}

const eintraege = (protokoll) => protokoll.lies(GILDE).eintraege;

test('pruefeEntzug nennt jeden der drei Gründe', () => {
  const frei = { id: 'a', name: 'Frei', vergebbar: true, sperrgrund: null };
  const hoch = { id: 'b', name: 'Hoch', vergebbar: false, sperrgrund: 'Steht über der Rolle des Bots — Discord lässt ihn daran nicht rühren.' };

  assert.equal(pruefeEntzug(frei, 'x').erlaubt, true);
  assert.match(pruefeEntzug(frei, 'a').grund, /Auslöserrolle selbst/);
  assert.match(pruefeEntzug(hoch, 'x').grund, /über der Rolle des Bots/);
  assert.match(pruefeEntzug(undefined, 'x').grund, /gibt es auf dem Server nicht mehr/);
});

test('beim Erhalt der Auslöserrolle werden die gewählten Rollen entzogen', async () => {
  await mitBot(async (u) => {
    u.rollenregeln.sichere(GILDE, 'r-verifiziert', {
      entzug: ['r-neu', 'r-gast'], aktiv: true,
    });

    await u.aendere({
      id: 'm1', name: 'Anna',
      vorher: ['r-neu', 'r-gast'], nachher: ['r-neu', 'r-gast', 'r-verifiziert'],
    });

    assert.deepEqual(u.doppel.entzogen.map((e) => e.rolle).sort(), ['r-gast', 'r-neu']);
    assert.match(u.doppel.entzogen[0].grund, /Rollenregel: erhielt „Verifiziert“/);

    const protokolliert = eintraege(u.protokoll);
    assert.equal(protokolliert.length, 2);
    assert.match(protokolliert[0].klartext, /entzogen, weil „Verifiziert“ dazukam/);
  });
});

test('eine Rolle, die inzwischen über die Bot-Rolle gerutscht ist, wird übersprungen', async () => {
  // Der eigentliche Grund für die zweite Prüfung: Beim Speichern war sie
  // erreichbar, jetzt ist sie es nicht mehr.
  await mitBot(
    async (u) => {
      u.rollenregeln.sichere(GILDE, 'r-verifiziert', { entzug: ['r-neu', 'r-gast'], aktiv: true });

      await u.aendere({
        id: 'm1', name: 'Anna',
        vorher: ['r-neu', 'r-gast'], nachher: ['r-neu', 'r-gast', 'r-verifiziert'],
      });

      // „Gast“ steht jetzt über dem Bot — nur „Neu“ wurde entzogen.
      assert.deepEqual(u.doppel.entzogen.map((e) => e.rolle), ['r-neu']);

      const uebersprungen = eintraege(u.protokoll).find((e) => e.art === 'rollenregel.uebersprungen');
      assert.ok(uebersprungen, 'Kein Protokolleintrag über das Überspringen');
      assert.equal(uebersprungen.ergebnis, 'fehler');
      assert.match(uebersprungen.klartext, /„Gast“ konnte nicht entzogen werden/);
      assert.match(uebersprungen.klartext, /über der Rolle des Bots/);
      assert.match(uebersprungen.klartext, /Regel: wer „Verifiziert“ erhält/);
    },
    {
      rollen: [
        { id: 'r-neu', name: 'Neu', position: 2 },
        { id: 'r-verifiziert', name: 'Verifiziert', position: 3 },
        // Über die Bot-Rolle geschoben, nachdem die Regel gespeichert wurde.
        { id: 'r-gast', name: 'Gast', position: 15 },
      ],
    },
  );
});

test('eine inzwischen von einer Integration verwaltete Rolle wird übersprungen', async () => {
  await mitBot(
    async (u) => {
      u.rollenregeln.sichere(GILDE, 'r-verifiziert', { entzug: ['r-gast'], aktiv: true });

      await u.aendere({
        id: 'm1', name: 'Anna', vorher: ['r-gast'], nachher: ['r-gast', 'r-verifiziert'],
      });

      assert.equal(u.doppel.entzogen.length, 0);
      assert.match(eintraege(u.protokoll)[0].klartext, /von einer Integration verwaltet/);
    },
    {
      rollen: [
        { id: 'r-verifiziert', name: 'Verifiziert', position: 3 },
        { id: 'r-gast', name: 'Gast', position: 4, managed: true },
      ],
    },
  );
});

test('eine gelöschte Rolle wird übersprungen, nicht blind versucht', async () => {
  await mitBot(async (u) => {
    u.rollenregeln.sichere(GILDE, 'r-verifiziert', { entzug: ['r-weg'], aktiv: true });

    await u.aendere({
      id: 'm1', name: 'Anna', vorher: ['r-weg'], nachher: ['r-weg', 'r-verifiziert'],
    });

    assert.equal(u.doppel.entzogen.length, 0);
    assert.match(eintraege(u.protokoll)[0].klartext, /gibt es auf dem Server nicht mehr/);
  });
});

test('ein Fehlschlag bei einer Rolle hält die übrigen nicht auf', async () => {
  // Halb angewendet und niemand weiss welche Hälfte — das ist der schlechteste
  // Ausgang. Deshalb läuft die Schleife weiter.
  await mitBot(
    async (u) => {
      u.rollenregeln.sichere(GILDE, 'r-verifiziert', { entzug: ['r-neu', 'r-gast'], aktiv: true });

      await u.aendere({
        id: 'm1', name: 'Anna',
        vorher: ['r-neu', 'r-gast'], nachher: ['r-neu', 'r-gast', 'r-verifiziert'],
      });

      assert.deepEqual(u.doppel.entzogen.map((e) => e.rolle), ['r-gast']);
      const fehler = eintraege(u.protokoll).find((e) => e.art === 'rollenregel.fehlgeschlagen');
      assert.ok(fehler, 'Der Fehlschlag wurde nicht protokolliert');
      assert.match(fehler.klartext, /„Neu“ konnte nicht entzogen werden/);
    },
    { rollenFehler: { 'r-neu': Object.assign(new Error('Missing Permissions'), { code: 50013 }) } },
  );
});

test('eine ausgeschaltete Regel wird nicht angewendet', async () => {
  await mitBot(async (u) => {
    u.rollenregeln.sichere(GILDE, 'r-verifiziert', { entzug: ['r-neu'], aktiv: false });

    await u.aendere({
      id: 'm1', name: 'Anna', vorher: ['r-neu'], nachher: ['r-neu', 'r-verifiziert'],
    });

    assert.equal(u.doppel.entzogen.length, 0);
    assert.equal(eintraege(u.protokoll).length, 0);
  });
});

test('wer die Rolle gar nicht hat, dem wird sie nicht genommen', async () => {
  await mitBot(async (u) => {
    u.rollenregeln.sichere(GILDE, 'r-verifiziert', { entzug: ['r-neu', 'r-gast'], aktiv: true });

    await u.aendere({
      id: 'm1', name: 'Anna', vorher: ['r-gast'], nachher: ['r-gast', 'r-verifiziert'],
    });

    assert.deepEqual(u.doppel.entzogen.map((e) => e.rolle), ['r-gast']);
    // Kein Protokolleintrag über „Neu“ — es gab dort nichts zu tun.
    assert.equal(eintraege(u.protokoll).length, 1);
  });
});

test('eine entzogene Rolle löst die Regel nicht erneut aus', async () => {
  // Das Entziehen meldet Discord wieder als guildMemberUpdate — aber ohne neue
  // Rolle, also passiert nichts. Sonst liefe es im Kreis.
  await mitBot(async (u) => {
    u.rollenregeln.sichere(GILDE, 'r-verifiziert', { entzug: ['r-neu'], aktiv: true });

    await u.aendere({
      id: 'm1', name: 'Anna', vorher: ['r-neu'], nachher: ['r-neu', 'r-verifiziert'],
    });
    // Und jetzt das Folgeereignis, das Discord selbst schickt.
    await u.aendere({
      id: 'm1', name: 'Anna', vorher: ['r-neu', 'r-verifiziert'], nachher: ['r-verifiziert'],
    });

    assert.equal(u.doppel.entzogen.length, 1, 'Die Regel wurde ein zweites Mal angewendet');
  });
});

test('ohne Regel für die neue Rolle passiert nichts', async () => {
  await mitBot(async (u) => {
    await u.aendere({
      id: 'm1', name: 'Anna', vorher: ['r-neu'], nachher: ['r-neu', 'r-verifiziert'],
    });

    assert.equal(u.doppel.entzogen.length, 0);
    assert.equal(eintraege(u.protokoll).length, 0);
  });
});
