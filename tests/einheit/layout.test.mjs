import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seite, NAVIGATION } from '../../src/web/html/layout.mjs';
import { html } from '../../src/web/html/html.mjs';
import { STUFE } from '../../src/auth/rechte.mjs';

const GRUND = {
  titel: 'Übersicht',
  pfad: '/',
  stufe: STUFE.OWNER,
  sitzung: { anzeigename: 'Anna', csrfToken: 'token-123' },
  botStatus: { verbunden: true },
  inhalt: html`<p>Inhalt</p>`,
};

test('die Seite ist deutschsprachiges HTML mit Zeichensatz und Titel', () => {
  const ausgabe = String(seite(GRUND));

  assert.match(ausgabe, /<!doctype html>/i);
  assert.match(ausgabe, /<html lang="de">/);
  assert.match(ausgabe, /<meta charset="utf-8">/);
  assert.match(ausgabe, /<title>Übersicht · Discord-Panel<\/title>/);
});

test('es gibt einen Sprunglink zum Inhalt', () => {
  const ausgabe = String(seite(GRUND));

  assert.match(ausgabe, /href="#inhalt"/);
  assert.match(ausgabe, /id="inhalt"/);
});

test('die aktuelle Seite ist als solche ausgezeichnet — nicht nur farblich', () => {
  const ausgabe = String(seite({ ...GRUND, pfad: '/protokoll' }));

  assert.match(ausgabe, /href="\/protokoll"[^>]*aria-current="page"/);
});

test('die Navigation nennt alle Seiten des Panels', () => {
  const ausgabe = String(seite(GRUND));

  for (const eintrag of NAVIGATION) {
    assert.ok(ausgabe.includes(`href="${eintrag.pfad}"`), `${eintrag.name} fehlt in der Navigation`);
  }
});

test('ein Betrachter sieht nur die Seiten, die er auch benutzen darf', () => {
  const ausgabe = String(seite({ ...GRUND, stufe: STUFE.BETRACHTER }));

  assert.ok(ausgabe.includes('href="/protokoll"'), 'Das Protokoll fehlt');
  assert.ok(!ausgabe.includes('href="/rollenregeln"'), 'Rollenregeln sind sichtbar');
  assert.ok(!ausgabe.includes('href="/nachricht"'), 'Der Nachrichteneditor ist sichtbar');
});

test('ein Moderator sieht die Arbeitsseiten', () => {
  const ausgabe = String(seite({ ...GRUND, stufe: STUFE.MODERATOR }));

  assert.ok(ausgabe.includes('href="/rollenregeln"'));
  assert.ok(ausgabe.includes('href="/vorlagen"'));
});

test('nur der Owner sieht die Zugriffsverwaltung', () => {
  assert.ok(String(seite({ ...GRUND, stufe: STUFE.OWNER })).includes('href="/zugriff"'));
  assert.ok(!String(seite({ ...GRUND, stufe: STUFE.MODERATOR })).includes('href="/zugriff"'));
});

test('die Kopfzeile zeigt einen verbundenen Bot als verbunden', () => {
  const ausgabe = String(seite(GRUND));

  assert.match(ausgabe, /verbunden/i);
});

test('ist der Bot nicht verbunden, steht der Grund gleich daneben', () => {
  const ausgabe = String(
    seite({ ...GRUND, botStatus: { verbunden: false, grund: 'Der Token wurde abgelehnt.' } }),
  );

  assert.match(ausgabe, /Der Token wurde abgelehnt\./);
});

test('der Abmelden-Knopf bringt das CSRF-Token mit', () => {
  const ausgabe = String(seite(GRUND));

  assert.match(ausgabe, /name="_csrf" value="token-123"/);
});

test('der angemeldete Name steht in der Kopfzeile — maskiert', () => {
  const ausgabe = String(seite({ ...GRUND, sitzung: { anzeigename: '<b>Anna</b>', csrfToken: 'x' } }));

  assert.ok(!ausgabe.includes('<b>Anna</b>'));
  assert.match(ausgabe, /&lt;b&gt;Anna&lt;\/b&gt;/);
});

test('das Stylesheet wird als eigene Datei eingebunden, nicht inline', () => {
  const ausgabe = String(seite(GRUND));

  assert.match(ausgabe, /<link rel="stylesheet" href="\/panel\.css/);
  assert.ok(!/<style/.test(ausgabe), 'Es gibt einen Inline-Style-Block');
});

test('die Seite enthält kein Inline-JavaScript', () => {
  const ausgabe = String(seite(GRUND));

  assert.ok(!/<script(?![^>]*\ssrc=)/.test(ausgabe), 'Es gibt ein Skript ohne src');
  assert.ok(!/ on[a-z]+="/.test(ausgabe), 'Es gibt einen Inline-Ereignisumgang');
});
