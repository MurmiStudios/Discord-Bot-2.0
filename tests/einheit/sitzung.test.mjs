import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { oeffneDatenbank } from '../../src/daten/db.mjs';
import { migriere, ladeMigrationen } from '../../src/daten/migrieren.mjs';
import { erstelleGilden } from '../../src/daten/gilden.mjs';
import { erstelleSitzungen, COOKIE_NAME } from '../../src/auth/sitzung.mjs';
import { mitTempVerzeichnis } from '../hilfen/db.mjs';

const GILDE = '111111111111111111';
const SCHLUESSEL = 'a'.repeat(64);
const NUTZER = { discordUserId: '4242', anzeigename: 'Anna', avatar: 'abc' };

/** Datenbank plus Sitzungsablage mit steuerbarer Uhr. */
async function mitSitzungen(fn, optionen = {}) {
  return mitTempVerzeichnis(async (dir) => {
    const db = oeffneDatenbank(join(dir, 'panel.db'));
    migriere(db, ladeMigrationen(new URL('../../src/daten/migrationen/', import.meta.url).pathname));
    erstelleGilden(db).merke(GILDE, 'Testserver');

    let uhr = Date.parse('2026-08-30T12:00:00Z');
    const sitzungen = erstelleSitzungen(db, {
      sessionSecret: SCHLUESSEL,
      jetzt: () => uhr,
      ...optionen,
    });

    try {
      return await fn({ db, sitzungen, vorspulen: (ms) => { uhr += ms; } });
    } finally {
      db.close();
    }
  });
}

test('eine angelegte Sitzung laesst sich mit ihrer Kennung wieder lesen', async () => {
  await mitSitzungen(({ sitzungen }) => {
    const { kennung } = sitzungen.lege_an(GILDE, NUTZER);

    const sitzung = sitzungen.lies(kennung);
    assert.equal(sitzung.discordUserId, '4242');
    assert.equal(sitzung.anzeigename, 'Anna');
    assert.equal(sitzung.guildId, GILDE);
  });
});

test('jede Sitzung bekommt eine eigene, ausreichend lange Kennung', async () => {
  await mitSitzungen(({ sitzungen }) => {
    const eine = sitzungen.lege_an(GILDE, NUTZER).kennung;
    const andere = sitzungen.lege_an(GILDE, NUTZER).kennung;

    assert.notEqual(eine, andere);
    assert.ok(eine.length >= 32, `Kennung ist nur ${eine.length} Zeichen lang`);
  });
});

test('die Kennung steht nirgends im Klartext in der Datenbank', async () => {
  await mitSitzungen(({ db, sitzungen }) => {
    const { kennung } = sitzungen.lege_an(GILDE, NUTZER);

    const zeilen = JSON.stringify(db.prepare('SELECT * FROM sitzungen').all());
    assert.ok(!zeilen.includes(kennung), 'Die Kennung liegt im Klartext in der Tabelle');
  });
});

test('eine unbekannte Kennung ergibt keine Sitzung', async () => {
  await mitSitzungen(({ sitzungen }) => {
    assert.equal(sitzungen.lies('gibt-es-nicht'), undefined);
    assert.equal(sitzungen.lies(''), undefined);
    assert.equal(sitzungen.lies(undefined), undefined);
  });
});

test('jede Sitzung bringt ihr eigenes CSRF-Token mit', async () => {
  await mitSitzungen(({ sitzungen }) => {
    const eine = sitzungen.lege_an(GILDE, NUTZER);
    const andere = sitzungen.lege_an(GILDE, NUTZER);

    assert.ok(eine.csrfToken.length >= 32);
    assert.notEqual(eine.csrfToken, andere.csrfToken);
    assert.equal(sitzungen.lies(eine.kennung).csrfToken, eine.csrfToken);
  });
});

test('eine abgelaufene Sitzung wird nicht mehr gelesen', async () => {
  await mitSitzungen(({ sitzungen, vorspulen }) => {
    const { kennung } = sitzungen.lege_an(GILDE, NUTZER);

    vorspulen(8 * 24 * 60 * 60 * 1000);

    assert.equal(sitzungen.lies(kennung), undefined);
  });
});

test('eine abgelaufene Sitzung wird beim Lesen gleich weggeraeumt', async () => {
  await mitSitzungen(({ db, sitzungen, vorspulen }) => {
    const { kennung } = sitzungen.lege_an(GILDE, NUTZER);
    vorspulen(8 * 24 * 60 * 60 * 1000);

    sitzungen.lies(kennung);

    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM sitzungen').get().n, 0);
  });
});

test('Benutzung verlaengert die Sitzung, sie faellt nicht mitten in der Arbeit weg', async () => {
  await mitSitzungen(({ sitzungen, vorspulen }) => {
    const { kennung } = sitzungen.lege_an(GILDE, NUTZER);

    // Kurz vor Ablauf noch einmal benutzen ...
    vorspulen(6 * 24 * 60 * 60 * 1000);
    assert.ok(sitzungen.lies(kennung), 'Sitzung war schon vorher weg');

    // ... danach gilt die Frist erneut ab jetzt.
    vorspulen(3 * 24 * 60 * 60 * 1000);
    assert.ok(sitzungen.lies(kennung), 'Die Benutzung hat nicht verlaengert');
  });
});

test('eine geloeschte Sitzung ist sofort ungueltig', async () => {
  await mitSitzungen(({ sitzungen }) => {
    const { kennung } = sitzungen.lege_an(GILDE, NUTZER);

    sitzungen.loesche(kennung);

    assert.equal(sitzungen.lies(kennung), undefined);
  });
});

test('das Aufraeumen entfernt abgelaufene Sitzungen und laesst gueltige stehen', async () => {
  await mitSitzungen(({ db, sitzungen, vorspulen }) => {
    sitzungen.lege_an(GILDE, NUTZER);
    vorspulen(8 * 24 * 60 * 60 * 1000);
    const frisch = sitzungen.lege_an(GILDE, NUTZER);

    const entfernt = sitzungen.raeumeAuf();

    assert.equal(entfernt, 1);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM sitzungen').get().n, 1);
    assert.ok(sitzungen.lies(frisch.kennung));
  });
});

test('ueber HTTPS traegt das Cookie das Secure-Kennzeichen', async () => {
  await mitSitzungen(({ sitzungen }) => {
    const optionen = sitzungen.cookieOptionen({ sicheresCookie: true });

    assert.equal(optionen.secure, true);
    assert.equal(optionen.httpOnly, true);
    assert.equal(optionen.sameSite, 'lax');
    assert.equal(optionen.path, '/');
  });
});

test('ueber HTTP bleibt Secure aus, sonst kaeme das Cookie nie an', async () => {
  await mitSitzungen(({ sitzungen }) => {
    assert.equal(sitzungen.cookieOptionen({ sicheresCookie: false }).secure, false);
  });
});

test('der Cookie-Name ist festgelegt und nicht geraten', () => {
  assert.equal(typeof COOKIE_NAME, 'string');
  assert.ok(COOKIE_NAME.length > 0);
});

test('der zeitkonstante Vergleich erkennt Gleichheit und jede Abweichung', async () => {
  const { gleichSicher } = await import('../../src/auth/sitzung.mjs');

  assert.equal(gleichSicher('abcdef', 'abcdef'), true);
  assert.equal(gleichSicher('abcdef', 'abcdeg'), false);
  assert.equal(gleichSicher('abcdef', 'abcde'), false, 'Unterschiedliche Laenge');
  assert.equal(gleichSicher('abc', undefined), false);
  assert.equal(gleichSicher(undefined, undefined), false, 'Zwei fehlende Werte sind nicht gleich');
});
