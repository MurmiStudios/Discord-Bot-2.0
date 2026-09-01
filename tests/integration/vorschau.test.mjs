import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mitApp, GILDE } from '../hilfen/app.mjs';

const SITZUNG_COOKIE = 'panel_sitzung';
const START = '<!--vorschau-start-->';
const ENDE = '<!--vorschau-ende-->';

function alsOwner({ sitzungen, konfig }) {
  const { kennung, csrfToken } = sitzungen.lege_an(GILDE, {
    discordUserId: konfig.ownerId,
    anzeigename: 'Owner',
  });
  return { cookie: `${SITZUNG_COOKIE}=${encodeURIComponent(kennung)}`, csrfToken };
}

async function sende(basis, cookie, paare, pfad = '/nachricht') {
  const koerper = new URLSearchParams();
  for (const [name, wert] of paare) koerper.append(name, wert);
  return fetch(`${basis}${pfad}`, {
    method: 'POST',
    redirect: 'manual',
    headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
    body: koerper.toString(),
  });
}

/** Schneidet die Vorschau aus einer vollständigen Seite heraus. */
function vorschauAus(seitentext) {
  const von = seitentext.indexOf(START);
  const bis = seitentext.indexOf(ENDE);
  assert.ok(von >= 0 && bis > von, 'Die Seite enthält keine Vorschau');
  return seitentext.slice(von, bis + ENDE.length);
}

test('die Vorschau zeigt den geschriebenen Text', async () => {
  await mitApp(async (u) => {
    const { cookie, csrfToken } = alsOwner(u);

    const text = await (
      await sende(u.basis, cookie, [
        ['_csrf', csrfToken], ['art', 'dm'], ['text', 'Hallo Welt'], ['wechselZu', 'dm'],
      ])
    ).text();

    assert.match(vorschauAus(text), /Hallo Welt/);
  });
});

test('mit Beispieldaten stehen echte Namen statt Platzhalter', async () => {
  await mitApp(async (u) => {
    const { cookie, csrfToken } = alsOwner(u);

    const text = await (
      await sende(u.basis, cookie, [
        ['_csrf', csrfToken], ['art', 'dm'], ['text', 'Hallo {user}!'],
        ['vorschauModus', 'beispiel'], ['wechselZu', 'dm'],
      ])
    ).text();
    const vorschau = vorschauAus(text);

    assert.ok(!vorschau.includes('{user}'), 'Der Platzhalter steht noch da');
    assert.match(vorschau, /Anna Beispiel/);
  });
});

test('im Rohtext bleibt der Platzhalter stehen — so sieht man, ob er stimmt', async () => {
  await mitApp(async (u) => {
    const { cookie, csrfToken } = alsOwner(u);

    const text = await (
      await sende(u.basis, cookie, [
        ['_csrf', csrfToken], ['art', 'dm'], ['text', 'Hallo {user}!'],
        ['vorschauModus', 'roh'], ['wechselZu', 'dm'],
      ])
    ).text();

    assert.match(vorschauAus(text), /\{user\}/);
  });
});

test('zwischen beiden Ansichten lässt sich ohne JavaScript umschalten', async () => {
  await mitApp(async (u) => {
    const { cookie, csrfToken } = alsOwner(u);

    const text = await (
      await sende(u.basis, cookie, [
        ['_csrf', csrfToken], ['art', 'dm'], ['text', 'Hallo {user}'],
        ['vorschauModus', 'beispiel'], ['vorschauWechseln', 'roh'],
      ])
    ).text();

    assert.match(vorschauAus(text), /\{user\}/);
    assert.match(text, /name="vorschauModus" value="roh"/);
  });
});

test('das Embed erscheint in der Vorschau mit allen seinen Teilen', async () => {
  await mitApp(async (u) => {
    const { cookie, csrfToken } = alsOwner(u);

    const vorschau = vorschauAus(
      await (
        await sende(u.basis, cookie, [
          ['_csrf', csrfToken], ['art', 'dm'], ['text', ''], ['embedAn', 'ja'],
          ['embedTitel', 'Mein Titel'], ['embedBeschreibung', 'Die Beschreibung'],
          ['embedFeldName', 'Feldname'], ['embedFeldWert', 'Feldwert'],
          ['embedFusszeile', 'Die Fußzeile'], ['embedAutor', 'Der Autor'],
          ['wechselZu', 'dm'],
        ])
      ).text(),
    );

    for (const teil of ['Mein Titel', 'Die Beschreibung', 'Feldname', 'Feldwert', 'Die Fußzeile', 'Der Autor']) {
      assert.ok(vorschau.includes(teil), `${teil} fehlt in der Vorschau`);
    }
  });
});

test('HTML im Text landet als Text in der Vorschau, nicht als Auszeichnung', async () => {
  await mitApp(async (u) => {
    const { cookie, csrfToken } = alsOwner(u);

    const vorschau = vorschauAus(
      await (
        await sende(u.basis, cookie, [
          ['_csrf', csrfToken], ['art', 'dm'], ['text', '<img src=x onerror=alert(1)>'],
          ['wechselZu', 'dm'],
        ])
      ).text(),
    );

    assert.ok(!vorschau.includes('<img src=x'), 'Das Bild-Element steht ungefiltert in der Vorschau');
    assert.match(vorschau, /&lt;img/);
  });
});

test('Zeilenumbrüche bleiben in der Vorschau erhalten', async () => {
  await mitApp(async (u) => {
    const { cookie, csrfToken } = alsOwner(u);

    const vorschau = vorschauAus(
      await (
        await sende(u.basis, cookie, [
          ['_csrf', csrfToken], ['art', 'dm'], ['text', 'Zeile eins\nZeile zwei'], ['wechselZu', 'dm'],
        ])
      ).text(),
    );

    assert.match(vorschau, /Zeile eins<br>Zeile zwei|Zeile eins\n\s*Zeile zwei/);
  });
});

test('eine angehängte Bildvorlage erscheint als Platzhalter in der Vorschau', async () => {
  await mitApp(async (u) => {
    const { cookie, csrfToken } = alsOwner(u);

    const vorschau = vorschauAus(
      await (
        await sende(u.basis, cookie, [
          ['_csrf', csrfToken], ['art', 'dm'], ['text', 'x'], ['bildvorlageId', '7'], ['wechselZu', 'dm'],
        ])
      ).text(),
    );

    assert.match(vorschau, /Bild/i);
  });
});

test('beide Wege zur Vorschau liefern genau dasselbe — es gibt nur einen Erzeuger', async () => {
  await mitApp(async (u) => {
    const { cookie, csrfToken } = alsOwner(u);
    const felder = [
      ['_csrf', csrfToken], ['art', 'dm'], ['text', 'Hallo {user}, willkommen!'],
      ['embedAn', 'ja'], ['embedTitel', 'Titel'], ['embedBeschreibung', 'Text'],
      ['vorschauModus', 'beispiel'],
    ];

    const ausSeite = vorschauAus(await (await sende(u.basis, cookie, [...felder, ['wechselZu', 'dm']])).text());
    const ausSchnittstelle = await (
      await sende(u.basis, cookie, felder, '/nachricht/vorschau')
    ).text();

    assert.equal(ausSchnittstelle.trim(), ausSeite.trim());
  });
});

test('die Vorschau-Schnittstelle ist nichts für Betrachter', async () => {
  await mitApp(
    async (u) => {
      const { kennung, csrfToken } = u.sitzungen.lege_an(GILDE, { discordUserId: '9999' });
      const cookie = `${SITZUNG_COOKIE}=${encodeURIComponent(kennung)}`;

      const antwort = await sende(
        u.basis, cookie, [['_csrf', csrfToken], ['art', 'dm'], ['text', 'x']], '/nachricht/vorschau',
      );

      assert.equal(antwort.status, 403);
    },
    { rollen: { 9999: ['555'] }, zugriffsregeln: [['555', 'BETRACHTER']] },
  );
});

test('die Vorschau-Schnittstelle ist begrenzt, damit sie nicht als Last dient', async () => {
  await mitApp(async (u) => {
    const { cookie, csrfToken } = alsOwner(u);
    const felder = [['_csrf', csrfToken], ['art', 'dm'], ['text', 'x']];

    let letzte;
    for (let i = 0; i < 62; i += 1) {
      letzte = await sende(u.basis, cookie, felder, '/nachricht/vorschau');
    }

    assert.equal(letzte.status, 429);
  });
});
