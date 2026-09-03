import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mitApp, GILDE } from '../hilfen/app.mjs';

/**
 * Die Test-DM an das eigene Konto.
 *
 * Sie geht über denselben Versender wie die Automatik — inklusive Bildvorlage
 * mit dem eigenen Profilbild. Ein Test, der einen anderen Weg nähme, prüfte
 * nicht das, was später wirklich passiert.
 */

const SITZUNG_COOKIE = 'panel_sitzung';

const SERVER = {
  gildenName: 'Mein Server',
  mitglieder: [
    { id: '4242', name: 'MurmiStudios', rollen: [] },
    { id: 'm1', name: 'Anna', rollen: [] },
  ],
};

function alsOwner({ sitzungen, konfig }) {
  const { kennung, csrfToken } = sitzungen.lege_an(GILDE, {
    discordUserId: konfig.ownerId, anzeigename: 'MurmiStudios',
  });
  return { cookie: `${SITZUNG_COOKIE}=${encodeURIComponent(kennung)}`, csrfToken };
}

async function post(basis, cookie, paare) {
  const koerper = new URLSearchParams();
  for (const [name, wert] of paare) koerper.append(name, wert);
  return fetch(`${basis}/willkommen`, {
    method: 'POST', redirect: 'manual',
    headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
    body: koerper.toString(),
  });
}

const mitServer = (fn, extra = {}) => mitApp(fn, { discordServer: SERVER, ...extra });

test('der Test schickt an das eigene Konto, mit ersetzten Platzhaltern', async () => {
  await mitServer(async (u) => {
    const { cookie, csrfToken } = alsOwner(u);

    const antwort = await post(u.basis, cookie, [
      ['_csrf', csrfToken], ['aktiv', 'nein'],
      ['text', 'Hallo {user}, willkommen auf {guild}!'], ['testen', 'ja'],
    ]);

    assert.equal(antwort.status, 200);
    assert.match(await antwort.text(), /als Test an dich verschickt/);

    assert.equal(u.doppelServer.gesendet.length, 1);
    const [dm] = u.doppelServer.gesendet;
    assert.equal(dm.ziel, '4242', 'Der Test ging an jemand anderen');
    assert.equal(dm.nutzlast.content, 'Hallo MurmiStudios, willkommen auf Mein Server!');
  });
});

test('der Test speichert vorher — geprüft wird, was man gerade getippt hat', async () => {
  await mitServer(async (u) => {
    const { cookie, csrfToken } = alsOwner(u);
    u.willkommen.sichere(GILDE, { aktiv: false, daten: { art: 'dm', text: 'Alte Fassung' } });

    await post(u.basis, cookie, [
      ['_csrf', csrfToken], ['aktiv', 'nein'], ['text', 'Neue Fassung'], ['testen', 'ja'],
    ]);

    assert.equal(u.doppelServer.gesendet[0].nutzlast.content, 'Neue Fassung');
    assert.equal(u.willkommen.lies(GILDE).daten.text, 'Neue Fassung');
  });
});

test('das Bild des Tests trägt das eigene Profilbild', async () => {
  const geholt = [];
  await mitServer(
    async (u) => {
      const { cookie, csrfToken } = alsOwner(u);
      const bildId = u.bildvorlagen.lege(GILDE, {
        name: 'Willkommensbanner',
        vorlage: {
          format: 'breit', grundfarbe: '#2b2d31',
          avatarAn: true, avatarForm: 'rund', avatarX: 40, avatarY: 40, avatarGroesse: 120,
          zeilen: [{ text: 'Willkommen, {user}!', x: 200, y: 200, groesse: 48, farbe: '#ffffff' }],
        },
      });

      await post(u.basis, cookie, [
        ['_csrf', csrfToken], ['aktiv', 'nein'], ['text', 'Schau mal'],
        ['bildvorlageId', String(bildId)], ['testen', 'ja'],
      ]);

      const [dm] = u.doppelServer.gesendet;
      assert.equal(dm.nutzlast.files[0].name, 'willkommensbanner.png');
      // Das Profilbild kam vom eigenen Konto, nicht von irgendeinem.
      assert.deepEqual(geholt, ['https://cdn.discordapp.com/avatars/4242/x.png']);
    },
    {
      avatarHolen: async (adresse) => {
        geholt.push(adresse);
        const { testBild } = await import('../hilfen/bild.mjs');
        return { ok: true, arrayBuffer: async () => testBild('#43b581', 64) };
      },
    },
  );
});

test('nimmt das eigene Konto keine Direktnachrichten an, steht der Grund im Klartext', async () => {
  await mitServer(
    async (u) => {
      const { cookie, csrfToken } = alsOwner(u);

      const antwort = await post(u.basis, cookie, [
        ['_csrf', csrfToken], ['aktiv', 'nein'], ['text', 'Hallo'], ['testen', 'ja'],
      ]);
      const text = await antwort.text();

      assert.equal(antwort.status, 502);
      assert.match(text, /Gespeichert, aber der Test kam nicht an/);
      // Im Klartext, nicht als Zahlencode.
      assert.doesNotMatch(text, /50007/);
      // Gespeichert wurde trotzdem.
      assert.equal(u.willkommen.lies(GILDE).daten.text, 'Hallo');
    },
    {
      discordServer: {
        ...SERVER,
        dmFehler: {
          4242: Object.assign(new Error('Cannot send messages to this user'), { code: 50007 }),
        },
      },
    },
  );
});

test('ohne Inhalt wird nichts verschickt und gesagt, warum', async () => {
  await mitServer(async (u) => {
    const { cookie, csrfToken } = alsOwner(u);

    const antwort = await post(u.basis, cookie, [
      ['_csrf', csrfToken], ['aktiv', 'nein'], ['text', '  '], ['testen', 'ja'],
    ]);

    assert.equal(antwort.status, 422);
    assert.match(await antwort.text(), /es gibt nichts zu verschicken/);
    assert.equal(u.doppelServer.gesendet.length, 0);
  });
});

test('aktiv und leer wird abgelehnt, bevor überhaupt getestet wird', async () => {
  await mitServer(async (u) => {
    const { cookie, csrfToken } = alsOwner(u);

    const antwort = await post(u.basis, cookie, [
      ['_csrf', csrfToken], ['aktiv', 'nein'], ['aktiv', 'ja'], ['text', ''], ['testen', 'ja'],
    ]);

    assert.equal(antwort.status, 422);
    assert.match(await antwort.text(), /Ohne Text, Embed-Karte und Bildvorlage/);
    assert.equal(u.doppelServer.gesendet.length, 0);
  });
});

test('der Test läuft auch, wenn die Nachricht ausgeschaltet ist', async () => {
  // Erst prüfen, dann scharfschalten — das ist die sinnvolle Reihenfolge.
  await mitServer(async (u) => {
    const { cookie, csrfToken } = alsOwner(u);

    await post(u.basis, cookie, [
      ['_csrf', csrfToken], ['aktiv', 'nein'], ['text', 'Noch im Entwurf'], ['testen', 'ja'],
    ]);

    assert.equal(u.doppelServer.gesendet.length, 1);
    assert.equal(u.willkommen.lies(GILDE).aktiv, false);
  });
});

test('ohne verbundenen Bot sagt der Test das, statt stillzuschweigen', async () => {
  await mitApp(
    async (u) => {
      const { cookie, csrfToken } = alsOwner(u);

      const antwort = await post(u.basis, cookie, [
        ['_csrf', csrfToken], ['aktiv', 'nein'], ['text', 'Hallo'], ['testen', 'ja'],
      ]);

      assert.equal(antwort.status, 502);
      assert.match(await antwort.text(), /nicht mit Discord verbunden/);
    },
    { discordServer: SERVER, botVerbunden: false },
  );
});
