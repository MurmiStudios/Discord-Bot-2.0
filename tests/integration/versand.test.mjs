import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mitApp, GILDE } from '../hilfen/app.mjs';
import { KANALART } from '../hilfen/discord-doppel.mjs';

const SITZUNG_COOKIE = 'panel_sitzung';

const SERVER = {
  gildenName: 'Mein Server',
  rollen: [{ id: 'r-neu', name: 'Neu', position: 2 }],
  mitglieder: [
    { id: 'm1', name: 'Anna', rollen: ['r-neu'] },
    { id: 'm2', name: 'Bert', rollen: ['r-neu'] },
    { id: '4242', name: 'Owner', rollen: [] },
  ],
  kanaele: [{ id: 'k1', name: 'allgemein', type: KANALART.TEXT }],
};

function alsOwner({ sitzungen, konfig }) {
  const { kennung, csrfToken } = sitzungen.lege_an(GILDE, {
    discordUserId: konfig.ownerId, anzeigename: 'Owner',
  });
  return { cookie: `${SITZUNG_COOKIE}=${encodeURIComponent(kennung)}`, csrfToken };
}

async function post(basis, pfad, cookie, paare) {
  const koerper = new URLSearchParams();
  for (const [name, wert] of paare) koerper.append(name, wert);
  return fetch(`${basis}${pfad}`, {
    method: 'POST',
    redirect: 'manual',
    headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
    body: koerper.toString(),
  });
}

const ENTWURF = [
  ['art', 'dm'], ['text', 'Hallo {user}!'],
  ['empfaenger', 'mitglied:m1'], ['empfaenger', 'mitglied:m2'],
];

const mitServer = (fn, extra = {}) => mitApp(fn, { discordServer: SERVER, ...extra });

test('ein Versand beginnt nicht ohne Rückfrage', async () => {
  await mitServer(async (u) => {
    const { cookie, csrfToken } = alsOwner(u);

    const antwort = await post(u.basis, '/nachricht', cookie, [
      ['_csrf', csrfToken], ...ENTWURF, ['senden', 'ja'],
    ]);
    const text = await antwort.text();

    assert.equal(antwort.status, 200);
    assert.match(text, /wirklich|bestätig/i);
    assert.equal(u.doppelServer.gesendet.length, 0, 'Es wurde ohne Rückfrage gesendet');
  });
});

test('die Rückfrage nennt, an wie viele Leute es geht', async () => {
  await mitServer(async (u) => {
    const { cookie, csrfToken } = alsOwner(u);

    const text = await (
      await post(u.basis, '/nachricht', cookie, [['_csrf', csrfToken], ...ENTWURF, ['senden', 'ja']])
    ).text();

    assert.match(text, /2 Empfänger|an 2 /);
  });
});

test('die Rückfrage trägt den Entwurf mit, damit nichts verloren geht', async () => {
  await mitServer(async (u) => {
    const { cookie, csrfToken } = alsOwner(u);

    const text = await (
      await post(u.basis, '/nachricht', cookie, [['_csrf', csrfToken], ...ENTWURF, ['senden', 'ja']])
    ).text();

    assert.match(text, /name="text"/);
    assert.ok(text.includes('value="mitglied:m1"'));
    assert.match(text, /name="bestaetigt"/);
  });
});

test('eine ungültige Nachricht kommt gar nicht erst zur Rückfrage', async () => {
  await mitServer(async (u) => {
    const { cookie, csrfToken } = alsOwner(u);

    const antwort = await post(u.basis, '/nachricht', cookie, [
      ['_csrf', csrfToken], ['art', 'dm'], ['text', ''], ['empfaenger', 'mitglied:m1'], ['senden', 'ja'],
    ]);

    assert.equal(antwort.status, 422);
  });
});

test('nach der Bestätigung läuft der Versand und die Seite führt zum Fortschritt', async () => {
  await mitServer(async (u) => {
    const { cookie, csrfToken } = alsOwner(u);

    const antwort = await post(u.basis, '/versand/starten', cookie, [
      ['_csrf', csrfToken], ...ENTWURF, ['bestaetigt', 'ja'],
    ]);

    assert.equal(antwort.status, 303);
    assert.match(antwort.headers.get('location'), /^\/versand\/\d+$/);
  });
});

test('die Nachrichten gehen mit eingesetzten Platzhaltern wirklich raus', async () => {
  await mitServer(async (u) => {
    const { cookie, csrfToken } = alsOwner(u);

    const antwort = await post(u.basis, '/versand/starten', cookie, [
      ['_csrf', csrfToken], ...ENTWURF, ['bestaetigt', 'ja'],
    ]);
    await u.warteAufVersand();

    assert.deepEqual(
      u.doppelServer.gesendet.map((g) => g.nutzlast.content).sort(),
      ['Hallo Anna!', 'Hallo Bert!'],
    );
    assert.ok(antwort.headers.get('location'));
  });
});

test('die Fortschrittsseite zeigt, wie weit der Versand ist', async () => {
  await mitServer(async (u) => {
    const { cookie, csrfToken } = alsOwner(u);
    const start = await post(u.basis, '/versand/starten', cookie, [
      ['_csrf', csrfToken], ...ENTWURF, ['bestaetigt', 'ja'],
    ]);
    await u.warteAufVersand();

    const text = await (
      await fetch(`${u.basis}${start.headers.get('location')}`, { headers: { cookie } })
    ).text();

    assert.match(text, /2 von 2/);
  });
});

test('nicht erreichte Empfänger stehen mit Grund im Klartext da', async () => {
  const abgelehnt = Object.assign(new Error('Cannot send messages to this user'), { code: 50007 });

  await mitServer(
    async (u) => {
      const { cookie, csrfToken } = alsOwner(u);
      const start = await post(u.basis, '/versand/starten', cookie, [
        ['_csrf', csrfToken], ...ENTWURF, ['bestaetigt', 'ja'],
      ]);
      await u.warteAufVersand();

      const text = await (
        await fetch(`${u.basis}${start.headers.get('location')}`, { headers: { cookie } })
      ).text();

      assert.match(text, /Anna/);
      assert.match(text, /Direktnachricht/i);
      assert.ok(!text.includes('50007'), 'Der Zahlencode steht auf der Seite');
    },
    { discordServer: { ...SERVER, dmFehler: { m1: abgelehnt } } },
  );
});

test('die Seite liest bei jedem Aufruf den gespeicherten Stand, nicht eine Momentaufnahme', async () => {
  await mitServer(async (u) => {
    const { cookie } = alsOwner(u);

    // Vorgang von Hand anlegen, damit der Stand kontrolliert wächst — im Test
    // läuft ein echter Versand sonst schneller durch, als man nachladen kann.
    const id = u.versandAblage.beginne(GILDE, {
      art: 'dm',
      empfaenger: [{ id: 'm1', name: 'Anna' }, { id: 'm2', name: 'Bert' }],
      akteur: { id: '4242', name: 'Owner' },
    });

    const leer = await (await fetch(`${u.basis}/versand/${id}`, { headers: { cookie } })).text();
    assert.match(leer, /0 von 2/);

    u.versandAblage.merkeErgebnis(GILDE, id, { empfaengerId: 'm1', zugestellt: true });

    const danach = await (await fetch(`${u.basis}/versand/${id}`, { headers: { cookie } })).text();
    assert.match(danach, /1 von 2/, 'Der neue Stand wird beim Neuladen nicht gezeigt');
  });
});

test('einen Vorgang, den es nicht gibt, gibt es auch nicht zu sehen', async () => {
  await mitServer(async (u) => {
    const { cookie } = alsOwner(u);

    assert.equal((await fetch(`${u.basis}/versand/9999`, { headers: { cookie } })).status, 404);
  });
});

test('ein Betrachter kann weder bestätigen noch den Fortschritt sehen', async () => {
  await mitApp(
    async (u) => {
      const { kennung, csrfToken } = u.sitzungen.lege_an(GILDE, { discordUserId: '9999' });
      const cookie = `${SITZUNG_COOKIE}=${encodeURIComponent(kennung)}`;

      const antwort = await post(u.basis, '/versand/starten', cookie, [
        ['_csrf', csrfToken], ...ENTWURF, ['bestaetigt', 'ja'],
      ]);

      assert.equal(antwort.status, 403);
      assert.equal((await fetch(`${u.basis}/versand/1`, { headers: { cookie } })).status, 403);
    },
    { discordServer: SERVER, rollen: { 9999: ['r-neu'] }, zugriffsregeln: [['r-neu', 'BETRACHTER']] },
  );
});

test('mehr als zehn Versände je Minute werden gebremst', async () => {
  await mitServer(async (u) => {
    const { cookie, csrfToken } = alsOwner(u);

    let letzte;
    for (let i = 0; i < 11; i += 1) {
      letzte = await post(u.basis, '/versand/starten', cookie, [
        ['_csrf', csrfToken], ...ENTWURF, ['bestaetigt', 'ja'],
      ]);
    }

    assert.equal(letzte.status, 429);
  });
});

test('ohne Bestätigung startet auch die Startadresse nichts', async () => {
  await mitServer(async (u) => {
    const { cookie, csrfToken } = alsOwner(u);

    const antwort = await post(u.basis, '/versand/starten', cookie, [['_csrf', csrfToken], ...ENTWURF]);

    assert.equal(antwort.status, 422);
    assert.equal(u.doppelServer.gesendet.length, 0);
  });
});
