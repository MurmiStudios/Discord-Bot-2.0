import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { oeffneDatenbank } from '../../src/daten/db.mjs';
import { migriere, ladeMigrationen } from '../../src/daten/migrieren.mjs';
import { erstelleGilden } from '../../src/daten/gilden.mjs';
import { erstelleRollenNachrichten } from '../../src/daten/rollen_nachrichten.mjs';
import { erstelleProtokoll } from '../../src/protokoll/protokoll.mjs';
import { erstelleLogger } from '../../src/kern/logger.mjs';
import { erstelleBot } from '../../src/discord/bot.mjs';
import { erstelleGildenAnsicht } from '../../src/discord/gilde.mjs';
import { erstelleVersender } from '../../src/discord/versender.mjs';
import { erstelleRollenAutomatik } from '../../src/automatik/rollen-nachricht.mjs';
import { registriereEreignisse, neueRollen } from '../../src/discord/ereignisse.mjs';
import { erstelleClientDoppel } from '../hilfen/discord-doppel.mjs';
import { mitTempVerzeichnis } from '../hilfen/db.mjs';

const GILDE = '111111111111111111';

const KONFIG = {
  token: 'x'.repeat(40), clientId: '1', clientSecret: 'y'.repeat(40),
  guildId: GILDE, ownerId: '4242', sessionSecret: 'z'.repeat(64),
  dmMaxEmpfaenger: 100, dmPauseMs: 0,
};

async function mitBot(fn, { dmFehler = {} } = {}) {
  return mitTempVerzeichnis(async (dir) => {
    const db = oeffneDatenbank(join(dir, 'panel.db'));
    migriere(db, ladeMigrationen(new URL('../../src/daten/migrationen/', import.meta.url).pathname));
    erstelleGilden(db).merke(GILDE, 'Mein Server');

    const doppel = erstelleClientDoppel({
      guildId: GILDE,
      gildenName: 'Mein Server',
      rollen: [
        { id: 'r-verifiziert', name: 'Verifiziert', position: 3 },
        { id: 'r-team', name: 'Team', position: 4 },
        { id: 'r-still', name: 'Ohne Nachricht', position: 2 },
      ],
      mitglieder: [{ id: '4242', name: 'Owner', rollen: [] }],
      dmFehler,
    });

    const zeilen = [];
    const logger = erstelleLogger({ schreibe: (z) => zeilen.push(z) });
    const bot = erstelleBot({ konfig: KONFIG, logger, erzeugeClient: () => doppel.client });
    await bot.verbinde();
    await new Promise((f) => setTimeout(f, 0));

    const gildenAnsicht = erstelleGildenAnsicht({ bot, konfig: KONFIG });
    const rollenNachrichten = erstelleRollenNachrichten(db);
    const protokoll = erstelleProtokoll(db);
    const versender = erstelleVersender({ bot, konfig: KONFIG, gildenAnsicht });

    const automatik = erstelleRollenAutomatik({
      rollenNachrichten, gildenAnsicht, versender, protokoll, logger, konfig: KONFIG,
    });

    const wartend = [];
    registriereEreignisse(doppel.client, {
      konfig: KONFIG, logger,
      beiRollenerhalt: (m, rollen) => {
        const lauf = automatik.beiRollenerhalt(m, rollen);
        wartend.push(lauf);
        return lauf;
      },
    });

    try {
      return await fn({
        doppel, rollenNachrichten, protokoll, logzeilen: zeilen,
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

test('neueRollen meldet nur, was dazugekommen ist', () => {
  assert.deepEqual(neueRollen(['a'], ['a', 'b']), ['b']);
  assert.deepEqual(neueRollen(['a', 'b'], ['a']), []);
  assert.deepEqual(neueRollen(['a'], ['a']), []);
  assert.deepEqual(neueRollen(undefined, ['a']), ['a']);
  assert.deepEqual(neueRollen(['a'], undefined), []);
});

test('eine hinzugekommene Rolle verschickt ihre Nachricht mit {role}', async () => {
  await mitBot(async (u) => {
    u.rollenNachrichten.sichere(GILDE, 'r-verifiziert', {
      aktiv: true,
      daten: { art: 'dm', text: 'Du hast jetzt {role} auf {guild}, {user}!' },
    });

    await u.aendere({ id: 'm1', name: 'Anna', vorher: [], nachher: ['r-verifiziert'] });

    assert.equal(u.doppel.gesendet.length, 1);
    assert.equal(u.doppel.gesendet[0].nutzlast.content,
      'Du hast jetzt Verifiziert auf Mein Server, Anna!');
  });
});

test('eine entzogene Rolle löst nichts aus', async () => {
  // Discord meldet jede Änderung am Mitglied als dasselbe Ereignis.
  await mitBot(async (u) => {
    u.rollenNachrichten.sichere(GILDE, 'r-verifiziert', {
      aktiv: true, daten: { art: 'dm', text: 'Hallo' },
    });

    await u.aendere({ id: 'm1', name: 'Anna', vorher: ['r-verifiziert'], nachher: [] });

    assert.equal(u.doppel.gesendet.length, 0);
    assert.equal(eintraege(u.protokoll).length, 0);
  });
});

test('eine Änderung ohne neue Rolle löst nichts aus', async () => {
  await mitBot(async (u) => {
    u.rollenNachrichten.sichere(GILDE, 'r-verifiziert', {
      aktiv: true, daten: { art: 'dm', text: 'Hallo' },
    });

    // Etwa ein Namenswechsel: dieselben Rollen vorher wie nachher.
    await u.aendere({
      id: 'm1', name: 'Anna neu', vorher: ['r-verifiziert'], nachher: ['r-verifiziert'],
    });

    assert.equal(u.doppel.gesendet.length, 0);
  });
});

test('zwei Rollen auf einmal lösen jede ihre eigene Nachricht aus', async () => {
  await mitBot(async (u) => {
    u.rollenNachrichten.sichere(GILDE, 'r-verifiziert', {
      aktiv: true, daten: { art: 'dm', text: 'Rolle: {role}' },
    });
    u.rollenNachrichten.sichere(GILDE, 'r-team', {
      aktiv: true, daten: { art: 'dm', text: 'Rolle: {role}' },
    });

    await u.aendere({ id: 'm1', name: 'Anna', vorher: [], nachher: ['r-verifiziert', 'r-team'] });

    assert.equal(u.doppel.gesendet.length, 2);
    assert.deepEqual(
      u.doppel.gesendet.map((g) => g.nutzlast.content).sort(),
      ['Rolle: Team', 'Rolle: Verifiziert'],
    );
  });
});

test('eine Rolle ohne hinterlegte Nachricht bleibt still', async () => {
  await mitBot(async (u) => {
    await u.aendere({ id: 'm1', name: 'Anna', vorher: [], nachher: ['r-still'] });

    assert.equal(u.doppel.gesendet.length, 0);
    assert.equal(eintraege(u.protokoll).length, 0);
  });
});

test('eine ausgeschaltete Nachricht bleibt still', async () => {
  await mitBot(async (u) => {
    u.rollenNachrichten.sichere(GILDE, 'r-team', {
      aktiv: false, daten: { art: 'dm', text: 'Willkommen im Team' },
    });

    await u.aendere({ id: 'm1', name: 'Anna', vorher: [], nachher: ['r-team'] });

    assert.equal(u.doppel.gesendet.length, 0);
  });
});

test('nur die neue Rolle löst aus, nicht die schon vorhandene', async () => {
  await mitBot(async (u) => {
    u.rollenNachrichten.sichere(GILDE, 'r-verifiziert', {
      aktiv: true, daten: { art: 'dm', text: 'Verifiziert!' },
    });
    u.rollenNachrichten.sichere(GILDE, 'r-team', {
      aktiv: true, daten: { art: 'dm', text: 'Team!' },
    });

    await u.aendere({
      id: 'm1', name: 'Anna', vorher: ['r-verifiziert'], nachher: ['r-verifiziert', 'r-team'],
    });

    assert.equal(u.doppel.gesendet.length, 1);
    assert.equal(u.doppel.gesendet[0].nutzlast.content, 'Team!');
  });
});

test('ein Fehlschlag steht im Klartext im Protokoll und hält nichts an', async () => {
  await mitBot(
    async (u) => {
      u.rollenNachrichten.sichere(GILDE, 'r-verifiziert', {
        aktiv: true, daten: { art: 'dm', text: 'Hallo' },
      });

      await u.aendere({ id: 'm1', name: 'Anna', vorher: [], nachher: ['r-verifiziert'] });

      const [eintrag] = eintraege(u.protokoll);
      assert.equal(eintrag.ergebnis, 'fehler');
      assert.match(eintrag.klartext, /„Verifiziert“ nicht zugestellt/);
      assert.doesNotMatch(eintrag.klartext, /50007/);
    },
    { dmFehler: { m1: Object.assign(new Error('Cannot send messages to this user'), { code: 50007 }) } },
  );
});

test('ein Bot bekommt keine Rollen-Nachricht', async () => {
  await mitBot(async (u) => {
    u.rollenNachrichten.sichere(GILDE, 'r-team', {
      aktiv: true, daten: { art: 'dm', text: 'Hallo' },
    });

    await u.aendere({ id: 'b1', name: 'Ein Bot', bot: true, vorher: [], nachher: ['r-team'] });

    assert.equal(u.doppel.gesendet.length, 0);
  });
});

test('eine Änderung auf einem anderen Server wird nicht beachtet', async () => {
  await mitBot(async (u) => {
    u.rollenNachrichten.sichere(GILDE, 'r-team', {
      aktiv: true, daten: { art: 'dm', text: 'Hallo' },
    });

    const bauen = (rollen) => ({
      id: 'fremd', displayName: 'Fremd',
      user: { id: 'fremd', username: 'fremd', bot: false },
      roles: { cache: new Map(rollen.map((r) => [r, { id: r, name: r }])) },
      guild: { id: '999999999999999999' },
    });
    u.doppel.client.emit('guildMemberUpdate', bauen([]), bauen(['r-team']));
    await new Promise((f) => setTimeout(f, 10));

    assert.equal(u.doppel.gesendet.length, 0);
  });
});
