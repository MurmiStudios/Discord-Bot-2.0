import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mitApp, GILDE } from '../hilfen/app.mjs';

const SITZUNG_COOKIE = 'panel_sitzung';

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

const MIT_EMBED = [
  ['art', 'dm'], ['text', 'Hallo'], ['embedAn', 'ja'],
  ['embedTitel', 'Titel'], ['embedBeschreibung', 'Beschreibung'],
  ['embedFusszeile', 'Fuss'], ['embedAutor', 'Autor'],
];

async function seiteMitEmbed(u, cookie, csrfToken, extra = []) {
  return (await sende(u.basis, cookie, [['_csrf', csrfToken], ...MIT_EMBED, ...extra, ['suchen', 'ja']])).text();
}

test('unter dem Textfeld steht eine Reihe mit allen Variablen', async () => {
  await mitApp(async (u) => {
    const { cookie } = alsOwner(u);

    const text = await (await fetch(`${u.basis}/nachricht`, { headers: { cookie } })).text();

    for (const variable of ['{user}', '{tag}', '{guild}', '{role}', '{count}']) {
      assert.ok(text.includes(`value="text|${variable}"`), `${variable} fehlt unter dem Textfeld`);
    }
  });
});

test('es gibt keine Zielwahl mehr — jede Reihe kennt ihr eigenes Feld', async () => {
  await mitApp(async (u) => {
    const { cookie } = alsOwner(u);

    const text = await (await fetch(`${u.basis}/nachricht`, { headers: { cookie } })).text();

    assert.ok(!text.includes('name="platzhalterZiel"'), 'Die Zielwahl steht noch da');
  });
});

test('jedes Textfeld des Embeds hat seine eigene Reihe', async () => {
  await mitApp(async (u) => {
    const { cookie, csrfToken } = alsOwner(u);

    const text = await seiteMitEmbed(u, cookie, csrfToken);

    for (const ziel of ['embedTitel', 'embedBeschreibung', 'embedFusszeile', 'embedAutor']) {
      assert.ok(text.includes(`value="${ziel}|{user}"`), `${ziel} hat keine eigene Reihe`);
    }
  });
});

test('die Reihe steht direkt hinter ihrem Feld, nicht irgendwo auf der Seite', async () => {
  await mitApp(async (u) => {
    const { cookie, csrfToken } = alsOwner(u);
    const text = await seiteMitEmbed(u, cookie, csrfToken);

    const feld = text.indexOf('name="embedBeschreibung"');
    const reihe = text.indexOf('value="embedBeschreibung|{user}"');
    const naechstesFeld = text.indexOf('name="embedFeldName"', feld);

    assert.ok(reihe > feld, 'Die Reihe steht vor ihrem Feld');
    assert.ok(
      naechstesFeld === -1 || reihe < naechstesFeld,
      'Die Reihe steht hinter einem anderen Feld',
    );
  });
});

test('auch Name und Wert eines Embed-Feldes haben je eine Reihe', async () => {
  await mitApp(async (u) => {
    const { cookie, csrfToken } = alsOwner(u);

    const text = await seiteMitEmbed(u, cookie, csrfToken, [
      ['embedFeldName', 'Regeln'], ['embedFeldWert', 'siehe #regeln'],
    ]);

    assert.ok(text.includes('value="embedFeldName:0|{user}"'));
    assert.ok(text.includes('value="embedFeldWert:0|{user}"'));
  });
});

test('ein Klick fügt genau in das Feld ein, unter dem die Reihe steht', async () => {
  await mitApp(async (u) => {
    const { cookie, csrfToken } = alsOwner(u);

    const text = await (
      await sende(u.basis, cookie, [
        ['_csrf', csrfToken], ...MIT_EMBED,
        ['platzhalterEinfuegen', 'embedBeschreibung|{user}'],
      ])
    ).text();

    assert.match(text, /Beschreibung\{user\}<\/textarea>/);
    assert.ok(!text.includes('Hallo{user}'), 'Der Platzhalter landete zusätzlich im Text');
    assert.ok(!text.includes('value="Titel{user}"'), 'Der Platzhalter landete im Titel');
  });
});

test('die Reihe unter dem Nachrichtentext trifft den Nachrichtentext', async () => {
  await mitApp(async (u) => {
    const { cookie, csrfToken } = alsOwner(u);

    const text = await (
      await sende(u.basis, cookie, [
        ['_csrf', csrfToken], ...MIT_EMBED, ['platzhalterEinfuegen', 'text|{guild}'],
      ])
    ).text();

    assert.match(text, /Hallo\{guild\}<\/textarea>/);
  });
});

test('ein einzelnes Embed-Feld wird nach seinem Index getroffen', async () => {
  await mitApp(async (u) => {
    const { cookie, csrfToken } = alsOwner(u);

    const text = await (
      await sende(u.basis, cookie, [
        ['_csrf', csrfToken], ...MIT_EMBED,
        ['embedFeldName', 'Rolle'], ['embedFeldWert', 'noch leer'],
        ['embedFeldName', 'Zweites'], ['embedFeldWert', 'auch leer'],
        ['platzhalterEinfuegen', 'embedFeldWert:1|{role}'],
      ])
    ).text();

    assert.match(text, /value="auch leer\{role\}"/);
    assert.ok(!text.includes('noch leer{role}'), 'Der Platzhalter landete im falschen Feld');
  });
});

test('ein erfundenes Ziel wird verworfen, statt irgendwohin zu schreiben', async () => {
  await mitApp(async (u) => {
    const { cookie, csrfToken } = alsOwner(u);

    const text = await (
      await sende(u.basis, cookie, [
        ['_csrf', csrfToken], ...MIT_EMBED, ['platzhalterEinfuegen', 'embedFeldWert:99|{user}'],
      ])
    ).text();

    assert.ok(!text.includes('Hallo{user}'), 'Es wurde in den Text ausgewichen');
    assert.ok(!text.includes('value="Titel{user}"'), 'Es wurde in den Titel ausgewichen');
  });
});

test('eine erfundene Variable wird verworfen', async () => {
  await mitApp(async (u) => {
    const { cookie, csrfToken } = alsOwner(u);

    const text = await (
      await sende(u.basis, cookie, [
        ['_csrf', csrfToken], ...MIT_EMBED, ['platzhalterEinfuegen', 'text|{gibtesnicht}'],
      ])
    ).text();

    assert.ok(!text.includes('{gibtesnicht}'), 'Eine erfundene Variable wurde übernommen');
  });
});

test('ein Wert ohne Trenner richtet keinen Schaden an', async () => {
  await mitApp(async (u) => {
    const { cookie, csrfToken } = alsOwner(u);

    const antwort = await sende(u.basis, cookie, [
      ['_csrf', csrfToken], ...MIT_EMBED, ['platzhalterEinfuegen', 'kaputt'],
    ]);

    assert.equal(antwort.status, 200);
    assert.ok(!(await antwort.text()).includes('kaputt<'), 'Der Rohwert wurde eingefügt');
  });
});

test('ohne Embed gibt es nur die Reihe unter dem Nachrichtentext', async () => {
  await mitApp(async (u) => {
    const { cookie } = alsOwner(u);

    const text = await (await fetch(`${u.basis}/nachricht`, { headers: { cookie } })).text();

    assert.ok(text.includes('value="text|{user}"'));
    assert.ok(!text.includes('value="embedBeschreibung|{user}"'), 'Eine Embed-Reihe ohne Embed');
  });
});

test('Platzhalter im Embed werden in der Vorschau ersetzt', async () => {
  await mitApp(async (u) => {
    const { cookie, csrfToken } = alsOwner(u);

    const text = await (
      await sende(u.basis, cookie, [
        ['_csrf', csrfToken], ['art', 'dm'], ['text', ''], ['embedAn', 'ja'],
        ['embedTitel', 'Hallo {user}'], ['embedBeschreibung', 'auf {guild}'],
        ['vorschauModus', 'beispiel'], ['suchen', 'ja'],
      ])
    ).text();
    const vorschau = text.slice(text.indexOf('<!--vorschau-start-->'), text.indexOf('<!--vorschau-ende-->'));

    assert.match(vorschau, /Hallo Anna Beispiel/);
    assert.match(vorschau, /auf Mein Server/);
  });
});

test('im Rohtext bleiben die Platzhalter im Embed stehen', async () => {
  await mitApp(async (u) => {
    const { cookie, csrfToken } = alsOwner(u);

    const text = await (
      await sende(u.basis, cookie, [
        ['_csrf', csrfToken], ['art', 'dm'], ['text', ''], ['embedAn', 'ja'],
        ['embedTitel', 'Hallo {user}'], ['vorschauModus', 'roh'], ['suchen', 'ja'],
      ])
    ).text();
    const vorschau = text.slice(text.indexOf('<!--vorschau-start-->'), text.indexOf('<!--vorschau-ende-->'));

    assert.match(vorschau, /Hallo \{user\}/);
  });
});
