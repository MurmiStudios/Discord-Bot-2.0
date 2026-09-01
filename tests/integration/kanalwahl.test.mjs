import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mitApp, GILDE } from '../hilfen/app.mjs';
import { KANALART, RECHT } from '../hilfen/discord-doppel.mjs';

const SITZUNG_COOKIE = 'panel_sitzung';

const SERVER = {
  kanaele: [
    { id: 'kat-a', name: 'Aufnahme', type: KANALART.KATEGORIE },
    { id: 'kat-b', name: 'Bereich', type: KANALART.KATEGORIE },
    { id: 'k-will', name: 'willkommen', type: KANALART.TEXT, parentId: 'kat-a', position: 0 },
    { id: 'k-news', name: 'news', type: KANALART.ANKUENDIGUNG, parentId: 'kat-a', position: 1 },
    { id: 'k-thread', name: 'nebenraum', type: KANALART.THREAD, parentId: 'kat-b' },
    { id: 'k-lesen', name: 'nur-lesen', type: KANALART.TEXT, parentId: 'kat-b', botDarf: [RECHT.KANAL_SEHEN] },
    { id: 'k-sprache', name: 'sprachkanal', type: KANALART.SPRACHE, parentId: 'kat-b' },
  ],
  mitglieder: [{ id: '4242', name: 'Owner', rollen: [] }],
};

function alsOwner({ sitzungen, konfig }) {
  const { kennung, csrfToken } = sitzungen.lege_an(GILDE, {
    discordUserId: konfig.ownerId, anzeigename: 'Owner',
  });
  return { cookie: `${SITZUNG_COOKIE}=${encodeURIComponent(kennung)}`, csrfToken };
}

async function sende(basis, cookie, paare) {
  const koerper = new URLSearchParams();
  for (const [name, wert] of paare) koerper.append(name, wert);
  return fetch(`${basis}/nachricht`, {
    method: 'POST',
    redirect: 'manual',
    headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
    body: koerper.toString(),
  });
}

const mitServer = (fn) => mitApp(fn, { discordServer: SERVER });

async function kanalseite(u, cookie) {
  return (await fetch(`${u.basis}/nachricht?art=kanal`, { headers: { cookie } })).text();
}

test('die Kanäle stehen nach Kategorien gruppiert', async () => {
  await mitServer(async (u) => {
    const { cookie } = alsOwner(u);

    const text = await kanalseite(u, cookie);

    assert.match(text, /Aufnahme/);
    assert.match(text, /Bereich/);
    assert.match(text, /willkommen/);
  });
});

test('Text-, Ankündigungs- und Thread-Kanäle sind unterscheidbar gekennzeichnet', async () => {
  await mitServer(async (u) => {
    const { cookie } = alsOwner(u);

    const text = await kanalseite(u, cookie);

    assert.match(text, /data-kanalart="text"/);
    assert.match(text, /data-kanalart="ankuendigung"/);
    assert.match(text, /data-kanalart="thread"/);
  });
});

test('ein Sprachkanal steht nicht zur Auswahl', async () => {
  await mitServer(async (u) => {
    const { cookie } = alsOwner(u);

    assert.ok(!(await kanalseite(u, cookie)).includes('sprachkanal'));
  });
});

test('ein Kanal ohne Schreibrecht ist gesperrt und nennt den Grund', async () => {
  await mitServer(async (u) => {
    const { cookie } = alsOwner(u);

    const text = await kanalseite(u, cookie);
    const stelle = text.slice(text.indexOf('nur-lesen') - 600, text.indexOf('nur-lesen') + 400);

    assert.match(stelle, /disabled/);
    assert.match(stelle, /nicht schreiben/i);
  });
});

test('ein erlaubter Kanal ist nicht gesperrt', async () => {
  await mitServer(async (u) => {
    const { cookie } = alsOwner(u);

    const text = await kanalseite(u, cookie);
    const stelle = text.slice(text.indexOf('value="k-will"') - 200, text.indexOf('value="k-will"') + 200);

    assert.ok(!stelle.includes('disabled'), 'Ein erlaubter Kanal ist gesperrt');
  });
});

test('ein gewählter Kanal bleibt nach einer Seitenaktion gewählt', async () => {
  await mitServer(async (u) => {
    const { cookie, csrfToken } = alsOwner(u);

    const text = await (
      await sende(u.basis, cookie, [
        ['_csrf', csrfToken], ['art', 'kanal'], ['text', 'x'], ['kanalId', 'k-will'],
        ['vorschauWechseln', 'roh'],
      ])
    ).text();

    assert.match(text, /value="k-will"[^>]*checked/);
  });
});

test('die Kanalsuche filtert die Liste', async () => {
  await mitServer(async (u) => {
    const { cookie, csrfToken } = alsOwner(u);

    const text = await (
      await sende(u.basis, cookie, [
        ['_csrf', csrfToken], ['art', 'kanal'], ['text', 'x'],
        ['kanalSuche', 'news'], ['suchen', 'ja'],
      ])
    ).text();

    // Auf die Kanal-ID pruefen, nicht auf den Namen: „willkommen" steht auch
    // im Navigationslink /willkommen.
    assert.ok(text.includes('value="k-news"'), 'Der gesuchte Kanal fehlt');
    assert.ok(!text.includes('value="k-will"'), 'Die Suche filtert nicht');
  });
});

test('eine untergeschobene Kanal-ID wird serverseitig abgelehnt, nicht nur im Formular ausgeblendet', async () => {
  await mitServer(async (u) => {
    const { cookie, csrfToken } = alsOwner(u);

    const antwort = await sende(u.basis, cookie, [
      ['_csrf', csrfToken], ['art', 'kanal'], ['text', 'Hallo'], ['kanalId', 'k-lesen'], ['pruefen', 'ja'],
    ]);

    assert.equal(antwort.status, 422);
    assert.match(await antwort.text(), /nicht schreiben/i);
  });
});

test('ein Kanal, den es gar nicht gibt, wird ebenfalls abgelehnt', async () => {
  await mitServer(async (u) => {
    const { cookie, csrfToken } = alsOwner(u);

    const antwort = await sende(u.basis, cookie, [
      ['_csrf', csrfToken], ['art', 'kanal'], ['text', 'Hallo'], ['kanalId', 'erfunden'], ['pruefen', 'ja'],
    ]);

    assert.equal(antwort.status, 422);
    assert.match(await antwort.text(), /nicht mehr|gibt es/i);
  });
});

test('ohne gewählten Kanal wird nicht gesendet', async () => {
  await mitServer(async (u) => {
    const { cookie, csrfToken } = alsOwner(u);

    const antwort = await sende(u.basis, cookie, [
      ['_csrf', csrfToken], ['art', 'kanal'], ['text', 'Hallo'], ['pruefen', 'ja'],
    ]);

    assert.equal(antwort.status, 422);
    assert.match(await antwort.text(), /Kanal/i);
  });
});

test('ein erlaubter Kanal kommt durch die Prüfung', async () => {
  await mitServer(async (u) => {
    const { cookie, csrfToken } = alsOwner(u);

    const antwort = await sende(u.basis, cookie, [
      ['_csrf', csrfToken], ['art', 'kanal'], ['text', 'Hallo'], ['kanalId', 'k-will'], ['pruefen', 'ja'],
    ]);

    assert.equal(antwort.status, 200);
  });
});
