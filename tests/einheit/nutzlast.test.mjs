import { test } from 'node:test';
import assert from 'node:assert/strict';
import { alsDiscordNachricht } from '../../src/nachricht/nutzlast.mjs';

const WERTE = { user: 'Anna', tag: 'anna', guild: 'Mein Server', role: 'Neu', count: 42 };

test('der Text wird mit eingesetzten Platzhaltern übergeben', () => {
  const nutzlast = alsDiscordNachricht({ text: 'Hallo {user}!' }, WERTE);

  assert.equal(nutzlast.content, 'Hallo Anna!');
});

test('ohne Text gibt es kein leeres content-Feld', () => {
  const nutzlast = alsDiscordNachricht({ text: '', embed: { beschreibung: 'x', felder: [] } }, WERTE);

  assert.equal(nutzlast.content, undefined);
});

test('das Embed wird in Discords Aufbau übersetzt', () => {
  const nutzlast = alsDiscordNachricht(
    {
      text: '',
      embed: {
        titel: 'Für {user}', beschreibung: 'auf {guild}', fusszeile: 'Fuß', autor: 'Autor',
        farbe: '#4b57e8', felder: [{ name: 'Rolle', wert: '{role}' }],
      },
    },
    WERTE,
  );
  const [embed] = nutzlast.embeds;

  assert.equal(embed.title, 'Für Anna');
  assert.equal(embed.description, 'auf Mein Server');
  assert.equal(embed.footer.text, 'Fuß');
  assert.equal(embed.author.name, 'Autor');
  assert.deepEqual(embed.fields, [{ name: 'Rolle', value: 'Neu' }]);
});

test('die Farbe wird als Zahl übergeben, wie Discord sie erwartet', () => {
  const nutzlast = alsDiscordNachricht(
    { text: 'x', embed: { beschreibung: 'y', farbe: '#4b57e8', felder: [] } },
    WERTE,
  );

  assert.equal(nutzlast.embeds[0].color, 0x4b57e8);
});

test('eine unbrauchbare Farbe führt nicht zu einer kaputten Nachricht', () => {
  const nutzlast = alsDiscordNachricht(
    { text: 'x', embed: { beschreibung: 'y', farbe: 'blau', felder: [] } },
    WERTE,
  );

  assert.equal(nutzlast.embeds[0].color, undefined);
});

test('leere Embed-Teile werden weggelassen statt als leerer Text geschickt', () => {
  const nutzlast = alsDiscordNachricht(
    { text: 'x', embed: { titel: '', beschreibung: 'nur das', fusszeile: '', autor: '', felder: [] } },
    WERTE,
  );
  const [embed] = nutzlast.embeds;

  assert.ok(!('title' in embed));
  assert.ok(!('footer' in embed));
  assert.ok(!('author' in embed));
});

test('Felder ohne Namen oder Wert werden nicht mitgeschickt', () => {
  const nutzlast = alsDiscordNachricht(
    {
      text: 'x',
      embed: { beschreibung: 'y', felder: [{ name: 'gut', wert: 'ja' }, { name: '', wert: 'nein' }] },
    },
    WERTE,
  );

  assert.deepEqual(nutzlast.embeds[0].fields, [{ name: 'gut', value: 'ja' }]);
});

test('ohne Embed gibt es keine embeds-Liste', () => {
  const nutzlast = alsDiscordNachricht({ text: 'x' }, WERTE);

  assert.equal(nutzlast.embeds, undefined);
});

test('ein Embed ganz ohne Inhalt wird weggelassen', () => {
  const nutzlast = alsDiscordNachricht(
    { text: 'x', embed: { titel: '', beschreibung: '', fusszeile: '', autor: '', felder: [] } },
    WERTE,
  );

  assert.equal(nutzlast.embeds, undefined);
});

test('eine Nachricht ohne jeden Inhalt ergibt keine Nutzlast', () => {
  assert.equal(alsDiscordNachricht({ text: '' }, WERTE), null);
});

test('trägt die Nachricht Embed und Bild, steckt das Bild im Embed', () => {
  // Discord zeigt einen Anhang genau einmal. Ohne die Verknüpfung hinge das
  // Bild unter der Karte statt darin.
  const nutzlast = alsDiscordNachricht(
    { text: '', embed: { titel: 'Willkommen', felder: [] } },
    {},
    [{ name: 'karte.png', daten: Buffer.from('x') }],
  );

  assert.deepEqual(nutzlast.embeds[0].image, { url: 'attachment://karte.png' });
  assert.equal(nutzlast.files.length, 1, 'die Datei geht trotzdem mit');
  assert.equal(nutzlast.files[0].name, 'karte.png');
});

test('ohne Embed bleibt das Bild ein gewöhnlicher Anhang', () => {
  const nutzlast = alsDiscordNachricht(
    { text: 'Hallo', embed: null },
    {},
    [{ name: 'karte.png', daten: Buffer.from('x') }],
  );

  assert.equal(nutzlast.embeds, undefined);
  assert.equal(nutzlast.files[0].name, 'karte.png');
});

test('ein Embed ohne Bild bekommt kein leeres Bildfeld', () => {
  const nutzlast = alsDiscordNachricht({ text: '', embed: { titel: 'Nur Text', felder: [] } }, {});

  assert.equal('image' in nutzlast.embeds[0], false);
});
