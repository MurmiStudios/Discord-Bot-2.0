import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mitApp, GILDE } from '../hilfen/app.mjs';

const SITZUNG_COOKIE = 'panel_sitzung';

function alsOwner({ sitzungen, konfig }) {
  const { kennung, csrfToken } = sitzungen.lege_an(GILDE, {
    discordUserId: konfig.ownerId,
    anzeigename: 'Owner',
  });
  return { cookie: `${SITZUNG_COOKIE}=${encodeURIComponent(kennung)}`, csrfToken };
}

async function hole(basis, cookie, pfad) {
  return fetch(`${basis}${pfad}`, { redirect: 'manual', headers: { cookie } });
}

async function sende(basis, cookie, felder) {
  return fetch(`${basis}/nachricht`, {
    method: 'POST',
    redirect: 'manual',
    headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(felder).toString(),
  });
}

test('die Seite bietet beide Ziele an', async () => {
  await mitApp(async (u) => {
    const { cookie } = alsOwner(u);

    const text = await (await hole(u.basis, cookie, '/nachricht')).text();

    assert.match(text, /Direktnachricht/);
    assert.match(text, /Kanal/);
  });
});

test('das gewählte Ziel steht in der Adresse und übersteht ein Neuladen', async () => {
  await mitApp(async (u) => {
    const { cookie } = alsOwner(u);

    const text = await (await hole(u.basis, cookie, '/nachricht?art=kanal')).text();

    assert.match(text, /aria-selected="true"[^>]*>\s*Kanal|Kanal[^<]*<\/[^>]+>\s*$/m);
    assert.ok(text.includes('name="art" value="kanal"'), 'Die Art wird nicht mitgeführt');
  });
});

test('ein Wechsel des Ziels behält den getippten Text', async () => {
  await mitApp(async (u) => {
    const { cookie, csrfToken } = alsOwner(u);

    const antwort = await sende(u.basis, cookie, {
      _csrf: csrfToken,
      art: 'dm',
      text: 'Mein halb fertiger Text',
      wechselZu: 'kanal',
    });
    const text = await antwort.text();

    assert.equal(antwort.status, 200);
    assert.match(text, /Mein halb fertiger Text/);
    assert.ok(text.includes('name="art" value="kanal"'), 'Das Ziel wurde nicht gewechselt');
  });
});

test('der Zeichenzähler steht an der Schrittmarke und zeigt die tatsächliche Länge', async () => {
  await mitApp(async (u) => {
    const { cookie, csrfToken } = alsOwner(u);

    const text = await (
      await sende(u.basis, cookie, { _csrf: csrfToken, art: 'dm', text: 'abcde', wechselZu: 'dm' })
    ).text();

    assert.match(text, /5\s*\/\s*2000/);
  });
});

test('die Platzhalter-Knopfreihe nennt alle Platzhalter', async () => {
  await mitApp(async (u) => {
    const { cookie } = alsOwner(u);

    const text = await (await hole(u.basis, cookie, '/nachricht')).text();

    for (const platzhalter of ['{user}', '{tag}', '{guild}', '{role}', '{count}']) {
      assert.ok(text.includes(platzhalter), `${platzhalter} fehlt in der Knopfreihe`);
    }
  });
});

test('ohne JavaScript hängt ein Platzhalter-Knopf den Platzhalter an den Text an', async () => {
  await mitApp(async (u) => {
    const { cookie, csrfToken } = alsOwner(u);

    const text = await (
      await sende(u.basis, cookie, {
        _csrf: csrfToken,
        art: 'dm',
        text: 'Hallo ',
        platzhalterEinfuegen: '{user}',
      })
    ).text();

    assert.match(text, /Hallo \{user\}/);
  });
});

test('ein untergeschobener Platzhalter wird nicht eingefügt', async () => {
  await mitApp(async (u) => {
    const { cookie, csrfToken } = alsOwner(u);

    const text = await (
      await sende(u.basis, cookie, {
        _csrf: csrfToken,
        art: 'dm',
        text: 'Hallo ',
        platzhalterEinfuegen: '{gibtesnicht}',
      })
    ).text();

    assert.ok(!text.includes('{gibtesnicht}'), 'Ein erfundener Platzhalter wurde übernommen');
  });
});

test('zu langer Text wird benannt abgelehnt, ohne die Eingabe zu verlieren', async () => {
  await mitApp(async (u) => {
    const { cookie, csrfToken } = alsOwner(u);
    const zuLang = 'x'.repeat(2001);

    const antwort = await sende(u.basis, cookie, {
      _csrf: csrfToken, art: 'dm', text: zuLang, pruefen: 'ja',
    });
    const text = await antwort.text();

    assert.equal(antwort.status, 422);
    assert.match(text, /2001/);
    assert.ok(text.includes(zuLang.slice(0, 100)), 'Der eingegebene Text ist weg');
  });
});

test('die alten Adressen leiten dauerhaft auf die neue Seite um', async () => {
  await mitApp(async (u) => {
    const { cookie } = alsOwner(u);

    const dm = await hole(u.basis, cookie, '/dm');
    assert.equal(dm.status, 301);
    assert.equal(dm.headers.get('location'), '/nachricht?art=dm');

    const kanaele = await hole(u.basis, cookie, '/kanaele');
    assert.equal(kanaele.status, 301);
    assert.equal(kanaele.headers.get('location'), '/nachricht?art=kanal');
  });
});

test('ein Betrachter kommt nicht an den Editor', async () => {
  await mitApp(
    async (u) => {
      const { kennung } = u.sitzungen.lege_an(GILDE, { discordUserId: '9999', anzeigename: 'B' });
      const cookie = `${SITZUNG_COOKIE}=${encodeURIComponent(kennung)}`;

      assert.equal((await hole(u.basis, cookie, '/nachricht')).status, 403);
    },
    { rollen: { 9999: ['555'] }, zugriffsregeln: [['555', 'BETRACHTER']] },
  );
});

test('der Editor kommt ohne Inline-Skript und ohne Inline-Style aus', async () => {
  await mitApp(async (u) => {
    const { cookie } = alsOwner(u);

    const text = await (await hole(u.basis, cookie, '/nachricht')).text();

    assert.ok(!/<script(?![^>]*\ssrc=)/.test(text));
    assert.ok(!/ style="/.test(text));
    assert.ok(!/ on[a-z]+="/.test(text));
  });
});

test('die Editor-Verbesserung wird als eigene Datei geladen und ausgeliefert', async () => {
  await mitApp(async (u) => {
    const { cookie } = alsOwner(u);

    const text = await (await hole(u.basis, cookie, '/nachricht')).text();
    assert.match(text, /<script src="\/editor\.js\?v=[a-f0-9]+" defer><\/script>/);

    const datei = await fetch(`${u.basis}/editor.js`);
    assert.equal(datei.status, 200);
    assert.ok((await datei.text()).length > 100, 'Die Datei ist leer');
  });
});
