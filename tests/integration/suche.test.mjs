import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mitApp, GILDE } from '../hilfen/app.mjs';
import { STUFE } from '../../src/auth/rechte.mjs';

const SITZUNG_COOKIE = 'panel_sitzung';

function alsKonto({ sitzungen }, discordUserId) {
  const { kennung } = sitzungen.lege_an(GILDE, { discordUserId, anzeigename: 'Test' });
  return `${SITZUNG_COOKIE}=${encodeURIComponent(kennung)}`;
}

async function suche(basis, cookie, q) {
  return fetch(`${basis}/suche?q=${encodeURIComponent(q)}`, {
    redirect: 'manual',
    headers: { cookie },
  });
}

test('die Suche findet mehrere Seiten nach einem Namensteil', async () => {
  await mitApp(async (umgebung) => {
    const cookie = alsKonto(umgebung, umgebung.konfig.ownerId);

    const text = await (await suche(umgebung.basis, cookie, 'rollen')).text();

    assert.match(text, /Rollenregeln/);
    assert.match(text, /Rollen-Nachrichten/);
  });
});

test('bei genau einem Treffer springt die Suche gleich hin', async () => {
  await mitApp(async (umgebung) => {
    const cookie = alsKonto(umgebung, umgebung.konfig.ownerId);

    const antwort = await suche(umgebung.basis, cookie, 'protokoll');

    assert.equal(antwort.status, 302);
    assert.equal(antwort.headers.get('location'), '/protokoll');
  });
});

test('ohne Suchbegriff werden alle erreichbaren Seiten aufgezählt', async () => {
  await mitApp(async (umgebung) => {
    const cookie = alsKonto(umgebung, umgebung.konfig.ownerId);

    const text = await (await suche(umgebung.basis, cookie, '')).text();

    assert.match(text, /Übersicht/);
    assert.match(text, /Bildvorlagen/);
  });
});

test('ein Betrachter findet keine Seite, die er nicht öffnen dürfte', async () => {
  await mitApp(
    async (umgebung) => {
      const cookie = alsKonto(umgebung, '9999');

      const text = await (await suche(umgebung.basis, cookie, '')).text();

      assert.match(text, /Protokoll/);
      assert.ok(!/Rollenregeln/.test(text), 'Eine gesperrte Seite steht in den Treffern');
    },
    { rollen: { 9999: ['555'] }, zugriffsregeln: [['555', STUFE.BETRACHTER]] },
  );
});

test('ohne Treffer erklärt die Seite das, statt leer zu bleiben', async () => {
  await mitApp(async (umgebung) => {
    const cookie = alsKonto(umgebung, umgebung.konfig.ownerId);

    const text = await (await suche(umgebung.basis, cookie, 'xyzabc')).text();

    assert.match(text, /nichts gefunden|keine Seite/i);
  });
});

test('die Suche ist ohne JavaScript ein gewöhnliches Formular', async () => {
  await mitApp(async (umgebung) => {
    const cookie = alsKonto(umgebung, umgebung.konfig.ownerId);

    const text = await (await fetch(`${umgebung.basis}/`, { headers: { cookie } })).text();

    assert.match(text, /<form[^>]*action="\/suche"[^>]*>/);
    assert.match(text, /method="get"/);
    assert.match(text, /name="q"/);
  });
});

test('die Verbesserung mit JavaScript wird als eigene Datei geladen', async () => {
  await mitApp(async (umgebung) => {
    const cookie = alsKonto(umgebung, umgebung.konfig.ownerId);
    const text = await (await fetch(`${umgebung.basis}/`, { headers: { cookie } })).text();

    assert.match(text, /<script src="\/suche\.js\?v=[a-f0-9]+" defer><\/script>/);
    assert.equal((await fetch(`${umgebung.basis}/suche.js`)).status, 200);
  });
});

test('der Suchbegriff kann kein HTML in die Trefferseite schmuggeln', async () => {
  await mitApp(async (umgebung) => {
    const cookie = alsKonto(umgebung, umgebung.konfig.ownerId);

    const text = await (await suche(umgebung.basis, cookie, '<img src=x onerror=alert(1)>')).text();

    assert.ok(!text.includes('<img src=x'), 'Das Bild-Element steht ungefiltert in der Seite');
  });
});
