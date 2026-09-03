import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GRENZE, embedZeichen, istLeer, leeresEmbed } from '../../src/nachricht/modell.mjs';
import { pruefeNachricht } from '../../src/nachricht/pruefen.mjs';
import { vorschau } from '../../src/nachricht/vorschau.mjs';

const x = (anzahl) => 'x'.repeat(anzahl);

/** Formulareingabe, wie sie aus dem Browser käme: alles Zeichenketten. */
function eingabe(felder = {}) {
  return { art: 'dm', text: 'Hallo', ...felder };
}

test('die Grenzen entsprechen denen von Discord', () => {
  assert.equal(GRENZE.TEXT, 2000);
  assert.equal(GRENZE.EMBED_GESAMT, 6000);
  assert.equal(GRENZE.TITEL, 256);
  assert.equal(GRENZE.BESCHREIBUNG, 4096);
  assert.equal(GRENZE.FELDER, 25);
});

test('genau 2000 Zeichen sind erlaubt', () => {
  assert.equal(pruefeNachricht(eingabe({ text: x(2000) })).ok, true);
});

test('ein Zeichen zu viel wird abgelehnt und das Feld benannt', () => {
  const ergebnis = pruefeNachricht(eingabe({ text: x(2001) }));

  assert.equal(ergebnis.ok, false);
  assert.ok(ergebnis.fehler.some((f) => f.feld === 'text'));
  assert.match(ergebnis.fehler.find((f) => f.feld === 'text').meldung, /2000/);
});

test('der Embed-Zähler rechnet alle Teile zusammen, so wie Discord es tut', () => {
  const embed = {
    titel: x(10),
    beschreibung: x(20),
    fusszeile: x(5),
    autor: x(4),
    felder: [{ name: x(3), wert: x(7) }],
  };

  assert.equal(embedZeichen(embed), 10 + 20 + 5 + 4 + 3 + 7);
});

test('ein leeres Embed zählt null Zeichen', () => {
  assert.equal(embedZeichen(leeresEmbed()), 0);
  assert.equal(embedZeichen(undefined), 0);
});

test('genau 6000 Embed-Zeichen sind erlaubt', () => {
  const ergebnis = pruefeNachricht(
    eingabe({ embedAn: 'ja', embedBeschreibung: x(4096), embedFusszeile: x(1904) }),
  );

  assert.equal(embedZeichen(ergebnis.wert.embed), 6000);
  assert.equal(ergebnis.ok, true);
});

test('ein Zeichen über 6000 wird vor dem Senden gemeldet, nicht von Discord danach', () => {
  const ergebnis = pruefeNachricht(
    eingabe({ embedAn: 'ja', embedBeschreibung: x(4096), embedFusszeile: x(1905) }),
  );

  assert.equal(ergebnis.ok, false);
  const fehler = ergebnis.fehler.find((f) => f.feld === 'embed');
  assert.match(fehler.meldung, /6000/);
  assert.match(fehler.meldung, /6001/, 'Die Meldung nennt nicht, wie viele es tatsächlich sind');
});

test('die Einzelgrenzen der Embed-Teile werden je Feld gemeldet', () => {
  const ergebnis = pruefeNachricht(eingabe({ embedAn: 'ja', embedTitel: x(257) }));

  assert.equal(ergebnis.ok, false);
  assert.ok(ergebnis.fehler.some((f) => f.feld === 'embedTitel'));
});

test('mehr als 25 Embed-Felder werden abgelehnt', () => {
  const felder = Array.from({ length: 26 }, (_, i) => ({ name: `n${i}`, wert: `w${i}` }));

  const ergebnis = pruefeNachricht(eingabe({ embedAn: 'ja', embedFelder: felder }));

  assert.equal(ergebnis.ok, false);
  assert.ok(ergebnis.fehler.some((f) => f.feld === 'embedFelder'));
});

test('ein Embed-Feld ohne Namen oder Wert wird abgelehnt — Discord nimmt es nicht an', () => {
  const ergebnis = pruefeNachricht(
    eingabe({ embedAn: 'ja', embedFelder: [{ name: '', wert: 'nur Wert' }] }),
  );

  assert.equal(ergebnis.ok, false);
});

test('eine Nachricht ohne Text, Embed und Bild ist leer und wird abgelehnt', () => {
  const ergebnis = pruefeNachricht(eingabe({ text: '' }));

  assert.equal(ergebnis.ok, false);
  assert.ok(ergebnis.fehler.some((f) => /leer|nichts/i.test(f.meldung)));
});

test('nur ein Embed reicht als Inhalt', () => {
  assert.equal(
    pruefeNachricht(eingabe({ text: '', embedAn: 'ja', embedBeschreibung: 'Inhalt' })).ok,
    true,
  );
});

test('nur eine Bildvorlage reicht als Inhalt', () => {
  assert.equal(pruefeNachricht(eingabe({ text: '', bildvorlageId: '7' })).ok, true);
});

test('istLeer erkennt die drei Fälle einzeln', () => {
  assert.equal(istLeer({ text: '', embed: null, bildvorlageId: null }), true);
  assert.equal(istLeer({ text: '   ', embed: null, bildvorlageId: null }), true, 'Leerzeichen zählen nicht');
  assert.equal(istLeer({ text: 'x', embed: null, bildvorlageId: null }), false);
  assert.equal(istLeer({ text: '', embed: { beschreibung: 'x' }, bildvorlageId: null }), false);
  assert.equal(istLeer({ text: '', embed: null, bildvorlageId: '7' }), false);
});

test('ein Embed, das nur aus leeren Feldern besteht, gilt nicht als Inhalt', () => {
  assert.equal(istLeer({ text: '', embed: leeresEmbed(), bildvorlageId: null }), true);
});

test('ist der Embed-Schalter aus, wird kein Embed übernommen', () => {
  const ergebnis = pruefeNachricht(eingabe({ embedTitel: 'Wird ignoriert' }));

  assert.equal(ergebnis.wert.embed, null);
});

test('eine unbekannte Art wird abgelehnt statt geraten', () => {
  const ergebnis = pruefeNachricht(eingabe({ art: 'brieftaube' }));

  assert.equal(ergebnis.ok, false);
  assert.ok(ergebnis.fehler.some((f) => f.feld === 'art'));
});

test('der geprüfte Wert enthält nur bekannte Felder — nichts Untergeschobenes', () => {
  const ergebnis = pruefeNachricht(eingabe({ istAdmin: 'ja', __proto__: { boese: true } }));

  assert.equal(ergebnis.ok, true);
  assert.ok(!('istAdmin' in ergebnis.wert));
  assert.ok(!('boese' in ergebnis.wert));
});

test('Text wird nicht stillschweigend beschnitten, sondern abgelehnt', () => {
  const ergebnis = pruefeNachricht(eingabe({ text: x(2500) }));

  assert.equal(ergebnis.ok, false);
  assert.equal(ergebnis.wert, undefined, 'Es wurde trotzdem ein Wert geliefert');
});

test('die Vorschau zeigt das Bild in der Karte, wenn die Nachricht ein Embed hat', () => {
  // Sie muss zeigen, was ankommt: Bei einem Embed steckt der Anhang darin.
  const mitEmbed = String(vorschau({
    text: '', bildvorlageId: 7,
    embed: { titel: 'Willkommen', felder: [], fusszeile: 'unten' },
  }));

  const embedAnfang = mitEmbed.indexOf('v-embed-inhalt');
  const bild = mitEmbed.indexOf('v-bild');
  const fuss = mitEmbed.indexOf('v-embed-fuss');

  assert.ok(bild > embedAnfang, 'das Bild steht im Embed');
  assert.ok(bild < fuss, 'und über der Fusszeile, wie bei Discord');
  assert.equal(mitEmbed.split('v-bild').length - 1, 1, 'nur einmal, nicht zweimal');
});

test('ohne Embed steht das Bild unter der Nachricht', () => {
  const ohneEmbed = String(vorschau({ text: 'Hallo', bildvorlageId: 7, embed: null }));

  assert.ok(ohneEmbed.includes('v-bild'));
  assert.equal(ohneEmbed.includes('v-embed'), false);
});

test('ein leeres Embed schiebt das Bild nicht in eine Karte, die es nicht gibt', () => {
  const leer = String(vorschau({ text: 'Hallo', bildvorlageId: 7, embed: { titel: '', felder: [] } }));

  assert.equal(leer.includes('v-embed'), false);
  assert.equal(leer.split('v-bild').length - 1, 1);
});
