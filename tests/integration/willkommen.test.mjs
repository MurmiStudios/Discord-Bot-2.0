import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mitApp, GILDE } from '../hilfen/app.mjs';

/**
 * Die Willkommensnachricht.
 *
 * Drei Regeln, die zusammengehören: Ausschalten löscht nichts, aktiv und leer
 * gibt es nicht, und der Baukasten ist derselbe wie im Nachrichteneditor.
 */

const SITZUNG_COOKIE = 'panel_sitzung';

function alsOwner({ sitzungen, konfig }) {
  const { kennung, csrfToken } = sitzungen.lege_an(GILDE, {
    discordUserId: konfig.ownerId, anzeigename: 'Owner',
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

const hole = async (basis, cookie) =>
  (await fetch(`${basis}/willkommen`, { headers: { cookie } })).text();

test('die Seite bringt denselben Baukasten mit wie der Nachrichteneditor', async () => {
  await mitApp(async (u) => {
    const { cookie } = alsOwner(u);
    const text = await hole(u.basis, cookie);

    assert.match(text, /data-platzhalter-ziel="text"/);
    assert.match(text, /name="platzhalterEinfuegen"\s+value="text\|\{user\}"/);
    assert.match(text, /Embed-Karte anhängen/);
    assert.match(text, /name="bildvorlageId"/);
    assert.match(text, /id="vorschau"/);
    // Keine Empfängerwahl: Der Empfänger steht schon fest.
    assert.doesNotMatch(text, /name="empfaenger"/);
  });
});

test('Speichern hält Text und Aktiv-Zustand fest', async () => {
  await mitApp(async (u) => {
    const { cookie, csrfToken } = alsOwner(u);

    const antwort = await post(u.basis, cookie, [
      ['_csrf', csrfToken], ['aktiv', 'nein'], ['aktiv', 'ja'],
      ['text', 'Hallo {user}, willkommen auf {guild}!'], ['sichern', 'ja'],
    ]);

    assert.equal(antwort.status, 200);
    assert.match(await antwort.text(), /Gespeichert und aktiv/);

    const stand = u.willkommen.lies(GILDE);
    assert.equal(stand.aktiv, true);
    assert.equal(stand.daten.text, 'Hallo {user}, willkommen auf {guild}!');
  });
});

test('Ausschalten löscht nichts', async () => {
  // Wer eine Willkommensnachricht für den Sommer schreibt und im Herbst
  // abschaltet, will sie im nächsten Sommer wiederhaben.
  await mitApp(async (u) => {
    const { cookie, csrfToken } = alsOwner(u);

    await post(u.basis, cookie, [
      ['_csrf', csrfToken], ['aktiv', 'nein'], ['aktiv', 'ja'],
      ['text', 'Bleib bitte stehen'], ['sichern', 'ja'],
    ]);
    await post(u.basis, cookie, [
      ['_csrf', csrfToken], ['aktiv', 'nein'],
      ['text', 'Bleib bitte stehen'], ['sichern', 'ja'],
    ]);

    const stand = u.willkommen.lies(GILDE);
    assert.equal(stand.aktiv, false);
    assert.equal(stand.daten.text, 'Bleib bitte stehen');

    const text = await hole(u.basis, cookie);
    assert.match(text, /Bleib bitte stehen/);
    assert.match(text, /Ausgeschaltet/);
  });
});

test('aktiv ohne Text, Embed und Bild wird abgelehnt und benannt', async () => {
  await mitApp(async (u) => {
    const { cookie, csrfToken } = alsOwner(u);

    const antwort = await post(u.basis, cookie, [
      ['_csrf', csrfToken], ['aktiv', 'nein'], ['aktiv', 'ja'], ['text', '   '], ['sichern', 'ja'],
    ]);
    const text = await antwort.text();

    assert.equal(antwort.status, 422);
    assert.match(text, /Ohne Text, Embed-Karte und Bildvorlage gibt es nichts zu verschicken/);
    assert.equal(u.willkommen.lies(GILDE).aktiv, false, 'Es wurde trotzdem aktiviert');
  });
});

test('leer speichern ist erlaubt, solange es ausgeschaltet ist', async () => {
  await mitApp(async (u) => {
    const { cookie, csrfToken } = alsOwner(u);

    const antwort = await post(u.basis, cookie, [
      ['_csrf', csrfToken], ['aktiv', 'nein'], ['text', ''], ['sichern', 'ja'],
    ]);

    assert.equal(antwort.status, 200);
    assert.match(await antwort.text(), /Sie geht erst raus, wenn du sie aktivierst/);
  });
});

test('eine Bildvorlage allein reicht zum Aktivieren', async () => {
  await mitApp(async (u) => {
    const { cookie, csrfToken } = alsOwner(u);
    const bildId = u.bildvorlagen.lege(GILDE, { name: 'Banner', vorlage: { zeilen: [] } });

    const antwort = await post(u.basis, cookie, [
      ['_csrf', csrfToken], ['aktiv', 'nein'], ['aktiv', 'ja'], ['text', ''],
      ['bildvorlageId', String(bildId)], ['sichern', 'ja'],
    ]);

    assert.equal(antwort.status, 200);
    assert.equal(u.willkommen.lies(GILDE).aktiv, true);
  });
});

test('ein zu langer Text wird auch ausgeschaltet abgelehnt', async () => {
  // Grenzen gelten immer — nur „leer" ist im Entwurf erlaubt.
  await mitApp(async (u) => {
    const { cookie, csrfToken } = alsOwner(u);

    const antwort = await post(u.basis, cookie, [
      ['_csrf', csrfToken], ['aktiv', 'nein'], ['text', 'a'.repeat(2001)], ['sichern', 'ja'],
    ]);

    assert.equal(antwort.status, 422);
    assert.match(await antwort.text(), /2001/);
  });
});

test('die Embed-Karte lässt sich ohne JavaScript anhängen', async () => {
  await mitApp(async (u) => {
    const { cookie, csrfToken } = alsOwner(u);

    const text = await (
      await post(u.basis, cookie, [
        ['_csrf', csrfToken], ['aktiv', 'nein'], ['text', 'Hallo'], ['embedUmschalten', 'ja'],
      ])
    ).text();

    assert.match(text, /name="embedTitel"/);
    assert.match(text, /Hallo/, 'Der Text ging beim Umschalten verloren');
  });
});

test('ein Variablen-Knopf fügt ohne JavaScript ein', async () => {
  await mitApp(async (u) => {
    const { cookie, csrfToken } = alsOwner(u);

    const text = await (
      await post(u.basis, cookie, [
        ['_csrf', csrfToken], ['aktiv', 'nein'], ['text', 'Hallo '],
        ['platzhalterEinfuegen', 'text|{user}'],
      ])
    ).text();

    assert.match(text, /Hallo \{user\}/);
  });
});

test('die Seite sagt, dass {role} beim Beitritt leer bleibt', async () => {
  // Sonst schreibt jemand „Du hast {role} bekommen" und wundert sich.
  await mitApp(async (u) => {
    const { cookie } = alsOwner(u);
    assert.match(await hole(u.basis, cookie), /\{role\}<\/code> bleibt leer/);
  });
});

test('ein Betrachter kommt nicht an die Willkommensnachricht', async () => {
  await mitApp(
    async (u) => {
      const { kennung } = u.sitzungen.lege_an(GILDE, { discordUserId: 'm1', anzeigename: 'Anna' });
      const antwort = await fetch(`${u.basis}/willkommen`, {
        headers: { cookie: `${SITZUNG_COOKIE}=${encodeURIComponent(kennung)}` },
      });
      assert.equal(antwort.status, 403);
    },
    { rollen: { m1: ['r-schau'] }, zugriffsregeln: [['r-schau', 'BETRACHTER']] },
  );
});
