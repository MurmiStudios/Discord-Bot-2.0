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

test('die Knopfreihe hat eine Zielwahl, damit der Platzhalter weiss, wohin', async () => {
  await mitApp(async (u) => {
    const { cookie } = alsOwner(u);

    const text = await (await fetch(`${u.basis}/nachricht`, { headers: { cookie } })).text();

    assert.match(text, /name="platzhalterZiel"/);
    assert.match(text, /value="text"/);
  });
});

test('ohne Embed bietet die Zielwahl nur den Text an', async () => {
  await mitApp(async (u) => {
    const { cookie } = alsOwner(u);

    const text = await (await fetch(`${u.basis}/nachricht`, { headers: { cookie } })).text();
    const wahl = text.slice(text.indexOf('name="platzhalterZiel"'), text.indexOf('</select>'));

    assert.ok(!wahl.includes('embedBeschreibung'), 'Ein Embed-Ziel steht zur Wahl, obwohl es keins gibt');
  });
});

test('mit Embed stehen alle seine Textteile zur Wahl', async () => {
  await mitApp(async (u) => {
    const { cookie, csrfToken } = alsOwner(u);

    const text = await (
      await sende(u.basis, cookie, [['_csrf', csrfToken], ...MIT_EMBED, ['suchen', 'ja']])
    ).text();
    const wahl = text.slice(text.indexOf('name="platzhalterZiel"'), text.indexOf('</select>'));

    for (const ziel of ['embedTitel', 'embedBeschreibung', 'embedFusszeile', 'embedAutor']) {
      assert.ok(wahl.includes(`value="${ziel}"`), `${ziel} fehlt in der Zielwahl`);
    }
  });
});

test('der Platzhalter landet im gewählten Embed-Teil, nicht im Text', async () => {
  await mitApp(async (u) => {
    const { cookie, csrfToken } = alsOwner(u);

    const text = await (
      await sende(u.basis, cookie, [
        ['_csrf', csrfToken], ...MIT_EMBED,
        ['platzhalterZiel', 'embedBeschreibung'], ['platzhalterEinfuegen', '{user}'],
      ])
    ).text();

    assert.match(text, /Beschreibung\{user\}<\/textarea>/);
    assert.ok(!text.includes('Hallo{user}'), 'Der Platzhalter landete zusätzlich im Text');
  });
});

test('der Text bleibt das Ziel, wenn nichts anderes gewählt ist', async () => {
  await mitApp(async (u) => {
    const { cookie, csrfToken } = alsOwner(u);

    const text = await (
      await sende(u.basis, cookie, [
        ['_csrf', csrfToken], ...MIT_EMBED, ['platzhalterEinfuegen', '{guild}'],
      ])
    ).text();

    assert.match(text, /Hallo\{guild\}<\/textarea>/);
  });
});

test('auch ein einzelnes Embed-Feld lässt sich als Ziel wählen', async () => {
  await mitApp(async (u) => {
    const { cookie, csrfToken } = alsOwner(u);

    const text = await (
      await sende(u.basis, cookie, [
        ['_csrf', csrfToken], ...MIT_EMBED,
        ['embedFeldName', 'Rolle'], ['embedFeldWert', 'noch leer'],
        ['embedFeldName', 'Zweites'], ['embedFeldWert', 'auch leer'],
        ['platzhalterZiel', 'embedFeldWert:1'], ['platzhalterEinfuegen', '{role}'],
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
        ['_csrf', csrfToken], ...MIT_EMBED,
        ['platzhalterZiel', 'embedFeldWert:99'], ['platzhalterEinfuegen', '{user}'],
      ])
    ).text();

    assert.ok(!text.includes('{user}</textarea>'), 'Es wurde in den Text ausgewichen');
    assert.ok(!text.includes('Titel{user}'), 'Es wurde in den Titel ausgewichen');
  });
});

test('das gewählte Ziel bleibt nach dem Einfügen stehen', async () => {
  await mitApp(async (u) => {
    const { cookie, csrfToken } = alsOwner(u);

    const text = await (
      await sende(u.basis, cookie, [
        ['_csrf', csrfToken], ...MIT_EMBED,
        ['platzhalterZiel', 'embedTitel'], ['platzhalterEinfuegen', '{guild}'],
      ])
    ).text();

    assert.match(text, /value="embedTitel"\s+selected/);
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
