import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { oeffneDatenbank } from '../../src/daten/db.mjs';
import { migriere, ladeMigrationen } from '../../src/daten/migrieren.mjs';
import { erstelleGilden } from '../../src/daten/gilden.mjs';
import { erstelleWillkommen } from '../../src/daten/willkommen.mjs';
import { erstelleProtokoll } from '../../src/protokoll/protokoll.mjs';
import { erstelleLogger } from '../../src/kern/logger.mjs';
import { erstelleBot } from '../../src/discord/bot.mjs';
import { erstelleGildenAnsicht } from '../../src/discord/gilde.mjs';
import { erstelleVersender } from '../../src/discord/versender.mjs';
import { erstelleBildAnhang } from '../../src/versand/anhang.mjs';
import { erstelleBildvorlagen } from '../../src/daten/bildvorlagen.mjs';
import { erstelleAvatarQuelle } from '../../src/bilder/avatar.mjs';
import { erstelleWillkommensAutomatik } from '../../src/automatik/willkommen.mjs';
import { registriereEreignisse } from '../../src/discord/ereignisse.mjs';
import { erstelleClientDoppel } from '../hilfen/discord-doppel.mjs';
import { mitTempVerzeichnis } from '../hilfen/db.mjs';
import { testBild } from '../hilfen/bild.mjs';

const GILDE = '111111111111111111';

const KONFIG = {
  token: 'x'.repeat(40), clientId: '1', clientSecret: 'y'.repeat(40),
  guildId: GILDE, ownerId: '4242', sessionSecret: 'z'.repeat(64),
  dmMaxEmpfaenger: 100, dmPauseMs: 0, uploadMaxBytes: 5242880, uploadMaxKante: 4096,
};

/** Der ganze Weg vom Ereignis bis zum Versand, mit erfundenem Discord. */
async function mitBot(fn, { dmFehler = {} } = {}) {
  return mitTempVerzeichnis(async (dir) => {
    const db = oeffneDatenbank(join(dir, 'panel.db'));
    migriere(db, ladeMigrationen(new URL('../../src/daten/migrationen/', import.meta.url).pathname));
    erstelleGilden(db).merke(GILDE, 'Mein Server');

    const doppel = erstelleClientDoppel({
      guildId: GILDE,
      gildenName: 'Mein Server',
      mitglieder: [{ id: '4242', name: 'Owner', rollen: [] }],
      dmFehler,
    });

    const zeilen = [];
    const logger = erstelleLogger({ schreibe: (z) => zeilen.push(z) });
    const bot = erstelleBot({ konfig: KONFIG, logger, erzeugeClient: () => doppel.client });
    await bot.verbinde();
    await new Promise((f) => setTimeout(f, 0));

    const gildenAnsicht = erstelleGildenAnsicht({ bot, konfig: KONFIG });
    const bildvorlagen = erstelleBildvorlagen(db);
    const willkommen = erstelleWillkommen(db);
    const protokoll = erstelleProtokoll(db);

    const versender = erstelleVersender({
      bot, konfig: KONFIG, gildenAnsicht,
      anhangBauer: erstelleBildAnhang({
        bildvorlagen, gildenAnsicht, konfig: KONFIG,
        bilderVerzeichnis: join(dir, 'bilder'),
        avatarQuelle: erstelleAvatarQuelle({
          hole: async () => ({ ok: true, arrayBuffer: async () => testBild('#43b581', 64) }),
        }),
      }),
    });

    const automatik = erstelleWillkommensAutomatik({
      willkommen, versender, protokoll, logger, konfig: KONFIG,
    });

    // Genau die Verdrahtung, die auch start.mjs benutzt.
    const wartend = [];
    registriereEreignisse(doppel.client, {
      konfig: KONFIG, logger,
      beiBeitritt: (m) => {
        const lauf = automatik.beiBeitritt(m);
        wartend.push(lauf);
        return lauf;
      },
    });

    try {
      return await fn({
        doppel, willkommen, protokoll, bildvorlagen, db, logzeilen: zeilen,
        beitritt: async (angaben) => {
          doppel.loeseBeitrittAus(angaben);
          await Promise.all(wartend);
        },
      });
    } finally {
      db.close();
    }
  });
}

const eintraege = (protokoll) => protokoll.lies(GILDE).eintraege;

test('ein Beitritt verschickt die aktive Willkommensnachricht mit ersetzten Platzhaltern', async () => {
  await mitBot(async (u) => {
    u.willkommen.sichere(GILDE, {
      aktiv: true,
      daten: { art: 'dm', text: 'Hallo {user}, willkommen auf {guild}!' },
    });

    await u.beitritt({ id: 'neu1', name: 'Anna' });

    assert.equal(u.doppel.gesendet.length, 1);
    assert.equal(u.doppel.gesendet[0].art, 'dm');
    assert.equal(u.doppel.gesendet[0].ziel, 'neu1');
    assert.equal(u.doppel.gesendet[0].nutzlast.content, 'Hallo Anna, willkommen auf Mein Server!');
  });
});

test('die Bildvorlage wird für die beitretende Person erzeugt', async () => {
  await mitBot(async (u) => {
    const bildId = u.bildvorlagen.lege(GILDE, {
      name: 'Willkommensbanner',
      vorlage: {
        format: 'breit', grundfarbe: '#2b2d31',
        avatarAn: true, avatarForm: 'rund', avatarX: 40, avatarY: 40, avatarGroesse: 120,
        zeilen: [{ text: 'Willkommen, {user}!', x: 200, y: 200, groesse: 48, farbe: '#ffffff' }],
      },
    });
    u.willkommen.sichere(GILDE, {
      aktiv: true,
      daten: { art: 'dm', text: 'Schön, dass du da bist!', bildvorlageId: String(bildId) },
    });

    await u.beitritt({ id: 'neu1', name: 'Anna' });

    const [dm] = u.doppel.gesendet;
    assert.equal(dm.nutzlast.files.length, 1);
    assert.equal(dm.nutzlast.files[0].name, 'willkommensbanner.png');
    assert.ok(dm.nutzlast.files[0].attachment.length > 0);
  });
});

test('ist sie inaktiv, geht nichts raus — der Beitritt steht trotzdem im Protokoll', async () => {
  // Sonst sähe man später eine Lücke und wüsste nicht, ob niemand beigetreten
  // ist oder ob etwas nicht funktioniert hat.
  await mitBot(async (u) => {
    u.willkommen.sichere(GILDE, { aktiv: false, daten: { art: 'dm', text: 'Hallo {user}' } });

    await u.beitritt({ id: 'neu1', name: 'Anna' });

    assert.equal(u.doppel.gesendet.length, 0);

    const [eintrag] = eintraege(u.protokoll);
    assert.equal(eintrag.art, 'beitritt');
    assert.equal(eintrag.akteurName, 'Anna');
    assert.match(eintrag.klartext, /keine Willkommensnachricht aktiv/);
  });
});

test('aktiv, aber leer verschickt nichts und sagt es im Protokoll', async () => {
  await mitBot(async (u) => {
    u.willkommen.sichere(GILDE, { aktiv: true, daten: { art: 'dm', text: '' } });

    await u.beitritt({ id: 'neu1', name: 'Anna' });

    assert.equal(u.doppel.gesendet.length, 0);
    assert.match(eintraege(u.protokoll)[0].klartext, /aktiv, aber leer/);
  });
});

test('ohne eingerichtete Willkommensnachricht passiert nichts Schlimmes', async () => {
  await mitBot(async (u) => {
    await u.beitritt({ id: 'neu1', name: 'Anna' });

    assert.equal(u.doppel.gesendet.length, 0);
    assert.equal(eintraege(u.protokoll).length, 1);
  });
});

test('ein Bot wird nicht begrüsst', async () => {
  await mitBot(async (u) => {
    u.willkommen.sichere(GILDE, { aktiv: true, daten: { art: 'dm', text: 'Hallo {user}' } });

    await u.beitritt({ id: 'bot1', name: 'Ein Bot', bot: true });

    assert.equal(u.doppel.gesendet.length, 0);
    assert.equal(eintraege(u.protokoll).length, 0, 'Ein Bot-Beitritt wurde protokolliert');
  });
});

test('wer keine Direktnachrichten annimmt, hält den Bot nicht an', async () => {
  await mitBot(
    async (u) => {
      u.willkommen.sichere(GILDE, { aktiv: true, daten: { art: 'dm', text: 'Hallo {user}' } });

      await u.beitritt({ id: 'neu1', name: 'Anna' });

      const [eintrag] = eintraege(u.protokoll);
      assert.equal(eintrag.ergebnis, 'fehler');
      assert.match(eintrag.klartext, /nicht zugestellt/);
      // Im Klartext, nicht als Zahlencode.
      assert.doesNotMatch(eintrag.klartext, /50007/);
    },
    { dmFehler: { neu1: Object.assign(new Error('Cannot send messages to this user'), { code: 50007 }) } },
  );
});

test('ein Beitritt auf einem anderen Server wird nicht beachtet', async () => {
  await mitBot(async (u) => {
    u.willkommen.sichere(GILDE, { aktiv: true, daten: { art: 'dm', text: 'Hallo {user}' } });

    // Dasselbe Ereignis, aber mit fremder Gilde.
    u.doppel.client.emit('guildMemberAdd', {
      id: 'fremd', displayName: 'Fremd', user: { id: 'fremd', username: 'fremd', bot: false },
      roles: { cache: new Map() }, guild: { id: '999999999999999999' },
    });
    await new Promise((f) => setTimeout(f, 10));

    assert.equal(u.doppel.gesendet.length, 0);
    assert.equal(eintraege(u.protokoll).length, 0);
  });
});
