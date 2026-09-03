import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mitApp, GILDE } from '../hilfen/app.mjs';
import { KANALART } from '../hilfen/discord-doppel.mjs';

/**
 * Die Entwurfs-Schublade.
 *
 * Sie ist ausgeliefert nur ein Verweis und eine versteckte Liste. Die Tests
 * prüfen deshalb genau das: dass beides in der Seite steht, dass der Verweis
 * ohne JavaScript irgendwohin führt, und dass ein Eintrag den Editor wirklich
 * füllt.
 */

const SITZUNG_COOKIE = 'panel_sitzung';

const SERVER = {
  gildenName: 'Mein Server',
  mitglieder: [
    { id: '4242', name: 'Owner', rollen: [] },
    { id: 'm1', name: 'Anna', rollen: [] },
  ],
  kanaele: [{ id: 'k1', name: 'willkommen', type: KANALART.TEXT }],
};

function alsOwner({ sitzungen, konfig }) {
  const { kennung } = sitzungen.lege_an(GILDE, {
    discordUserId: konfig.ownerId, anzeigename: 'Owner',
  });
  return { cookie: `${SITZUNG_COOKIE}=${encodeURIComponent(kennung)}` };
}

const hole = async (basis, pfad, cookie) =>
  (await fetch(`${basis}${pfad}`, { headers: { cookie } })).text();

const mitServer = (fn) => mitApp(fn, { discordServer: SERVER });

test('das Stylesheet macht die versteckte Schublade wirklich unsichtbar', () => {
  // Ein eigener Test, weil die Falle unsichtbar ist: `display: flex` schlägt
  // die Vorgabe `[hidden] { display: none }` des Browsers. Ohne die Regel läge
  // die Schublade ohne JavaScript dauerhaft über dem Editor — im HTML sähe
  // trotzdem alles richtig aus.
  const css = readFileSync(new URL('../../src/web/oeffentlich/panel.css', import.meta.url), 'utf8');

  const regel = css.indexOf('.schublade[hidden]');
  const anzeige = css.indexOf('.schublade {');

  assert.ok(regel >= 0, 'Die Regel .schublade[hidden] fehlt');
  assert.ok(regel < anzeige, 'Die hidden-Regel steht nach der Anzeige und wird überschrieben');
  assert.match(css.slice(regel, regel + 60), /display:\s*none/);
});

test('der Editor trägt die Schublade als versteckte Liste mit', async () => {
  await mitServer(async (u) => {
    const { cookie } = alsOwner(u);
    u.nachrichtenAblage.lege(GILDE, {
      name: 'Willkommensgruss', art: 'dm',
      daten: { art: 'dm', text: 'Hallo {user}, schön dass du da bist!' },
    });

    const text = await hole(u.basis, '/nachricht', cookie);

    // Versteckt, nicht weggelassen: JavaScript blendet sie nur ein.
    assert.match(text, /<aside class="schublade" id="schublade" hidden/);
    assert.match(text, /Willkommensgruss/);
    assert.match(text, /Hallo \{user\}, schön dass du da bist!/);
  });
});

test('ohne JavaScript ist der Schalter ein Verweis auf die Liste', async () => {
  await mitServer(async (u) => {
    const { cookie } = alsOwner(u);
    const text = await hole(u.basis, '/nachricht', cookie);

    assert.match(text, /<a href="\/nachrichten" class="schubladen-schalter"/);
  });
});

test('ein Eintrag der Schublade führt zum geladenen Editor', async () => {
  await mitServer(async (u) => {
    const { cookie } = alsOwner(u);
    const id = u.nachrichtenAblage.lege(GILDE, {
      name: 'Zum Laden', art: 'kanal',
      daten: { art: 'kanal', text: 'Wartung heute Abend', kanalId: 'k1' },
    });

    const editor = await hole(u.basis, '/nachricht', cookie);
    assert.match(editor, new RegExp(`href="/nachricht\\?laden=${id}"`));

    // Und dieser Verweis füllt den Editor tatsächlich.
    const geladen = await hole(u.basis, `/nachricht?laden=${id}`, cookie);
    assert.match(geladen, /Wartung heute Abend/);
    assert.match(geladen, /<input type="hidden" name="art" value="kanal">/);
    assert.match(geladen, new RegExp(`name="gespeichertId" value="${id}"`));
  });
});

test('die Schublade sagt, dass Öffnen den Entwurf ersetzt', async () => {
  await mitServer(async (u) => {
    const { cookie } = alsOwner(u);
    const text = await hole(u.basis, '/nachricht', cookie);

    assert.match(text, /Öffnen ersetzt den Entwurf/);
  });
});

test('ohne gespeicherte Nachricht steht in der Schublade der Weg dorthin', async () => {
  await mitServer(async (u) => {
    const { cookie } = alsOwner(u);
    const text = await hole(u.basis, '/nachricht', cookie);

    assert.match(text, /Das Namensfeld unten im Editor legt hier etwas ab/);
  });
});

test('die Schublade zeigt den Stand nach dem Speichern sofort', async () => {
  await mitServer(async (u) => {
    const { sitzungen, konfig } = u;
    const { kennung, csrfToken } = sitzungen.lege_an(GILDE, {
      discordUserId: konfig.ownerId, anzeigename: 'Owner',
    });
    const cookie = `${SITZUNG_COOKIE}=${encodeURIComponent(kennung)}`;

    const koerper = new URLSearchParams();
    for (const [n, v] of [
      ['_csrf', csrfToken], ['art', 'dm'], ['name', 'Ganz frisch'],
      ['text', 'Hallo'], ['speichern', 'ja'],
    ]) koerper.append(n, v);

    await fetch(`${u.basis}/nachricht`, {
      method: 'POST', redirect: 'manual',
      headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
      body: koerper.toString(),
    });

    const text = await hole(u.basis, '/nachricht', cookie);
    assert.match(text, /class="schubladenname">Ganz frisch/);
  });
});

test('die Schublade zeigt keine Nachrichten anderer Server', async () => {
  await mitServer(async (u) => {
    const { cookie } = alsOwner(u);
    u.gilden.merke('999999999999999999', 'Fremd');
    u.nachrichtenAblage.lege('999999999999999999', {
      name: 'Fremdsache', art: 'dm', daten: { art: 'dm', text: 'x' },
    });

    const text = await hole(u.basis, '/nachricht', cookie);
    assert.doesNotMatch(text, /Fremdsache/);
  });
});
