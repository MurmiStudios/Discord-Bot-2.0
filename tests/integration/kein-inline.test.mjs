import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mitApp, GILDE } from '../hilfen/app.mjs';

const SITZUNG_COOKIE = 'panel_sitzung';
const CSS = new URL('../../src/web/oeffentlich/panel.css', import.meta.url);

function alsOwner({ sitzungen, konfig }) {
  const { kennung } = sitzungen.lege_an(GILDE, { discordUserId: konfig.ownerId, anzeigename: 'Owner' });
  return { cookie: `${SITZUNG_COOKIE}=${encodeURIComponent(kennung)}` };
}

test('die ausgelieferte Seite enthält keinen Inline-Style', async () => {
  await mitApp(async (umgebung) => {
    const { cookie } = alsOwner(umgebung);

    const text = await (await fetch(`${umgebung.basis}/`, { headers: { cookie } })).text();

    assert.ok(!/<style/.test(text), 'Es gibt einen Style-Block');
    assert.ok(!/ style="/.test(text), 'Es gibt ein style-Attribut');
  });
});

test('das Stylesheet wird ausgeliefert und als CSS gekennzeichnet', async () => {
  await mitApp(async ({ basis }) => {
    const antwort = await fetch(`${basis}/panel.css`);

    assert.equal(antwort.status, 200);
    assert.match(antwort.headers.get('content-type') ?? '', /text\/css/);
  });
});

test('der Verweis auf das Stylesheet trägt eine Version, damit ein Browser nichts Altes zeigt', async () => {
  await mitApp(async (umgebung) => {
    const { cookie } = alsOwner(umgebung);

    const text = await (await fetch(`${umgebung.basis}/`, { headers: { cookie } })).text();

    assert.match(text, /href="\/panel\.css\?v=[a-f0-9]{6,}"/);
  });
});

test('das Stylesheet ist ohne Anmeldung erreichbar — sonst sähe die Anmeldeseite nackt aus', async () => {
  await mitApp(async ({ basis }) => {
    assert.equal((await fetch(`${basis}/panel.css`)).status, 200);
  });
});

test('aus dem Verzeichnis für statische Dateien führt kein Weg heraus', async () => {
  await mitApp(async ({ basis }) => {
    for (const versuch of ['/../.env', '/..%2f.env', '/%2e%2e/%2e%2e/.env', '/../../package.json']) {
      const antwort = await fetch(`${basis}${versuch}`, { redirect: 'manual' });
      assert.ok(antwort.status >= 400, `${versuch} lieferte ${antwort.status}`);
    }
  });
});

test('das Stylesheet definiert beide Farbschemata', () => {
  const css = readFileSync(CSS, 'utf8');

  assert.match(css, /prefers-color-scheme:\s*dark/);
  assert.match(css, /:root/);
});

test('das Telefon-Layout hängt an der Fensterbreite, nicht an der Gerätekennung', () => {
  const css = readFileSync(CSS, 'utf8');

  assert.match(css, /@media\s*\(max-width:\s*900px\)/);
});

test('Bedienelemente sind am Telefon mindestens 44 Pixel hoch', () => {
  const css = readFileSync(CSS, 'utf8');
  const telefonteil = css.slice(css.indexOf('max-width: 900px'));

  assert.match(telefonteil, /44px/);
});

test('der Tastaturfokus ist sichtbar', () => {
  const css = readFileSync(CSS, 'utf8');

  assert.match(css, /:focus-visible/);
});

test('wer weniger Bewegung eingestellt hat, bekommt keine Übergänge', () => {
  const css = readFileSync(CSS, 'utf8');

  assert.match(css, /prefers-reduced-motion:\s*reduce/);
});

test('Zustände hängen nicht allein an der Farbe', () => {
  const css = readFileSync(CSS, 'utf8');

  assert.match(css, /aria-current/);
});
