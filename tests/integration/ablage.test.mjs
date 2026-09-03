import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mitApp, GILDE } from '../hilfen/app.mjs';
import { KANALART } from '../hilfen/discord-doppel.mjs';

/**
 * Speichern und Wiederfinden.
 *
 * Der Filter steht in der Adresse, nicht in einem Cookie. Deshalb prüft ein
 * Test ausdrücklich, dass ein Neuladen derselben Adresse dasselbe zeigt — das
 * ist der ganze Grund für die Entscheidung.
 */

const SITZUNG_COOKIE = 'panel_sitzung';

const SERVER = {
  gildenName: 'Mein Server',
  rollen: [{ id: 'r-neu', name: 'Neu', position: 2 }],
  mitglieder: [
    { id: '4242', name: 'Owner', rollen: [] },
    { id: 'm1', name: 'Anna', rollen: ['r-neu'] },
    { id: 'm2', name: 'Bert', rollen: ['r-neu'] },
  ],
  kanaele: [{ id: 'k1', name: 'willkommen', type: KANALART.TEXT }],
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
    method: 'POST', redirect: 'manual',
    headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
    body: koerper.toString(),
  });
}

const hole = async (basis, pfad, cookie) =>
  (await fetch(`${basis}${pfad}`, { headers: { cookie } })).text();

const mitServer = (fn, extra = {}) => mitApp(fn, { discordServer: SERVER, ...extra });

test('eine Nachricht lässt sich speichern, ohne sie zu senden', async () => {
  await mitServer(async (u) => {
    const { cookie, csrfToken } = alsOwner(u);

    const antwort = await post(u.basis, '/nachricht', cookie, [
      ['_csrf', csrfToken], ['art', 'dm'], ['name', 'Willkommensgruss'],
      ['text', 'Hallo {user}, schön dass du da bist!'],
      ['empfaenger', 'mitglied:m1'], ['speichern', 'ja'],
    ]);

    assert.equal(antwort.status, 303);
    assert.equal(antwort.headers.get('location'), '/nachrichten?art=dm');
    assert.equal(u.doppelServer.gesendet.length, 0, 'Speichern hat gesendet');

    const [eintrag] = u.nachrichtenAblage.alle(GILDE);
    assert.equal(eintrag.name, 'Willkommensgruss');
    assert.equal(eintrag.art, 'dm');
    assert.equal(eintrag.daten.text, 'Hallo {user}, schön dass du da bist!');
    assert.deepEqual(eintrag.daten.empfaenger, ['mitglied:m1']);
  });
});

test('ohne Namen wird nicht gespeichert, und der Text bleibt stehen', async () => {
  await mitServer(async (u) => {
    const { cookie, csrfToken } = alsOwner(u);

    const antwort = await post(u.basis, '/nachricht', cookie, [
      ['_csrf', csrfToken], ['art', 'dm'], ['name', '  '],
      ['text', 'Etwas Getipptes'], ['speichern', 'ja'],
    ]);
    const text = await antwort.text();

    assert.equal(antwort.status, 422);
    assert.equal(u.nachrichtenAblage.alle(GILDE).length, 0);
    assert.match(text, /Gib der Nachricht einen Namen/);
    assert.match(text, /Etwas Getipptes/);
  });
});

test('eine leere Nachricht wird nicht gespeichert', async () => {
  await mitServer(async (u) => {
    const { cookie, csrfToken } = alsOwner(u);

    const antwort = await post(u.basis, '/nachricht', cookie, [
      ['_csrf', csrfToken], ['art', 'dm'], ['name', 'Leer'], ['text', ''], ['speichern', 'ja'],
    ]);

    assert.equal(antwort.status, 422);
    assert.equal(u.nachrichtenAblage.alle(GILDE).length, 0);
  });
});

test('Speichern verlangt keine Empfänger — ein Entwurf darf unfertig sein', async () => {
  await mitServer(async (u) => {
    const { cookie, csrfToken } = alsOwner(u);

    const antwort = await post(u.basis, '/nachricht', cookie, [
      ['_csrf', csrfToken], ['art', 'dm'], ['name', 'Noch ohne Ziel'],
      ['text', 'Kommt noch'], ['speichern', 'ja'],
    ]);

    assert.equal(antwort.status, 303);
    assert.equal(u.nachrichtenAblage.alle(GILDE).length, 1);
  });
});

test('die Rückfrage sagt vorher, dass mitgespeichert wird', async () => {
  await mitServer(async (u) => {
    const { cookie, csrfToken } = alsOwner(u);

    const text = await (
      await post(u.basis, '/nachricht', cookie, [
        ['_csrf', csrfToken], ['art', 'dm'], ['name', 'Beim Senden'],
        ['text', 'Hallo'], ['empfaenger', 'mitglied:m1'], ['senden', 'ja'],
      ])
    ).text();

    assert.match(text, /Wird ausserdem unter <strong>Beim Senden<\/strong> gespeichert/);
  });
});

test('beim Senden wird mit Namen zusätzlich gespeichert', async () => {
  await mitServer(async (u) => {
    const { cookie, csrfToken } = alsOwner(u);

    await post(u.basis, '/versand/starten', cookie, [
      ['_csrf', csrfToken], ['art', 'dm'], ['name', 'Beim Senden'],
      ['text', 'Hallo'], ['empfaenger', 'mitglied:m1'], ['bestaetigt', 'ja'],
    ]);
    await u.warteAufVersand();

    assert.equal(u.doppelServer.gesendet.length, 1);
    assert.equal(u.nachrichtenAblage.alle(GILDE).length, 1);
  });
});

test('ohne Namen wird beim Senden nichts gespeichert', async () => {
  await mitServer(async (u) => {
    const { cookie, csrfToken } = alsOwner(u);

    await post(u.basis, '/versand/starten', cookie, [
      ['_csrf', csrfToken], ['art', 'dm'], ['text', 'Hallo'],
      ['empfaenger', 'mitglied:m1'], ['bestaetigt', 'ja'],
    ]);
    await u.warteAufVersand();

    assert.equal(u.doppelServer.gesendet.length, 1);
    assert.equal(u.nachrichtenAblage.alle(GILDE).length, 0);
  });
});

test('die Liste zeigt Auszug und Ziel', async () => {
  await mitServer(async (u) => {
    const { cookie } = alsOwner(u);
    u.nachrichtenAblage.lege(GILDE, {
      name: 'Kanalsache', art: 'kanal',
      daten: { art: 'kanal', text: 'Achtung, Wartung heute Abend', kanalId: 'k1' },
    });
    u.nachrichtenAblage.lege(GILDE, {
      name: 'Zwei Leute', art: 'dm',
      daten: { art: 'dm', text: 'Hallo', empfaenger: ['mitglied:m1', 'mitglied:m2'] },
    });

    const text = await hole(u.basis, '/nachrichten', cookie);

    assert.match(text, /Kanalsache/);
    assert.match(text, /Achtung, Wartung heute Abend/);
    assert.match(text, /#willkommen/);
    assert.match(text, /2 Einträge gemerkt/);
  });
});

test('der Filter zeigt nur die passende Art und zählt richtig', async () => {
  await mitServer(async (u) => {
    const { cookie } = alsOwner(u);
    u.nachrichtenAblage.lege(GILDE, { name: 'Eins', art: 'dm', daten: { art: 'dm', text: 'a' } });
    u.nachrichtenAblage.lege(GILDE, { name: 'Zwei', art: 'dm', daten: { art: 'dm', text: 'b' } });
    u.nachrichtenAblage.lege(GILDE, { name: 'Drei', art: 'kanal', daten: { art: 'kanal', text: 'c' } });

    const alle = await hole(u.basis, '/nachrichten?art=alle', cookie);
    assert.match(alle, /Alle <span class="reiter-zahl">3<\/span>/);

    const nurDm = await hole(u.basis, '/nachrichten?art=dm', cookie);
    assert.match(nurDm, /Eins/);
    assert.match(nurDm, /Zwei/);
    assert.doesNotMatch(nurDm, /class="ablagename">Drei/);

    const nurKanal = await hole(u.basis, '/nachrichten?art=kanal', cookie);
    assert.match(nurKanal, /class="ablagename">Drei/);
    assert.doesNotMatch(nurKanal, /class="ablagename">Eins/);
  });
});

test('der Filter steht in der Adresse und übersteht ein Neuladen', async () => {
  await mitServer(async (u) => {
    const { cookie } = alsOwner(u);
    u.nachrichtenAblage.lege(GILDE, { name: 'Kanalsache', art: 'kanal', daten: { art: 'kanal', text: 'c' } });
    u.nachrichtenAblage.lege(GILDE, { name: 'Direktsache', art: 'dm', daten: { art: 'dm', text: 'd' } });

    const erst = await hole(u.basis, '/nachrichten?art=kanal', cookie);
    const nochmal = await hole(u.basis, '/nachrichten?art=kanal', cookie);

    for (const text of [erst, nochmal]) {
      assert.match(text, /class="ablagename">Kanalsache/);
      assert.doesNotMatch(text, /class="ablagename">Direktsache/);
      assert.match(text, /aria-selected="true"[^>]*>Kanal /);
    }
  });
});

test('ein erfundener Filter in der Adresse heisst „alle" und ist kein Fehler', async () => {
  await mitServer(async (u) => {
    const { cookie } = alsOwner(u);
    u.nachrichtenAblage.lege(GILDE, { name: 'Eins', art: 'dm', daten: { art: 'dm', text: 'a' } });

    const antwort = await fetch(`${u.basis}/nachrichten?art=quatsch`, { headers: { cookie } });
    const text = await antwort.text();

    assert.equal(antwort.status, 200);
    assert.match(text, /Eins/);
    assert.match(text, /aria-selected="true"[^>]*>Alle /);
  });
});

test('gespeicherte Nachrichten eines anderen Servers tauchen nicht auf', async () => {
  await mitServer(async (u) => {
    const { cookie } = alsOwner(u);
    u.gilden.merke('999999999999999999', 'Fremd');
    u.nachrichtenAblage.lege('999999999999999999', {
      name: 'Fremdsache', art: 'dm', daten: { art: 'dm', text: 'x' },
    });

    const text = await hole(u.basis, '/nachrichten', cookie);

    assert.doesNotMatch(text, /Fremdsache/);
    assert.match(text, /Noch nichts gespeichert/);
  });
});

test('ein Betrachter kommt nicht an die gespeicherten Nachrichten', async () => {
  await mitServer(
    async (u) => {
      const { kennung } = u.sitzungen.lege_an(GILDE, { discordUserId: 'm1', anzeigename: 'Anna' });
      const antwort = await fetch(`${u.basis}/nachrichten`, {
        headers: { cookie: `${SITZUNG_COOKIE}=${encodeURIComponent(kennung)}` },
      });
      assert.equal(antwort.status, 403);
    },
    { rollen: { m1: ['r-schau'] }, zugriffsregeln: [['r-schau', 'BETRACHTER']] },
  );
});
