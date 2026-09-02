import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rendere, FORMATE, standardVorlage } from '../../src/bilder/renderer.mjs';
import { pixelAus, masse, testBild, istFarbe } from '../hilfen/bild.mjs';

const DATEN = { user: 'Anna Beispiel', tag: 'anna', guild: 'Mein Server', role: 'Neu', count: 128 };

function vorlage(aenderungen = {}) {
  return { ...standardVorlage(), grundfarbe: '#123456', avatarAn: false, zeilen: [], ...aenderungen };
}

test('das Ergebnis ist ein PNG', async () => {
  const png = await rendere(vorlage(), DATEN);

  assert.equal(png.subarray(1, 4).toString(), 'PNG');
});

test('jedes Format hat seine festgelegte Grösse', async () => {
  for (const [name, mass] of Object.entries(FORMATE)) {
    const png = await rendere(vorlage({ format: name }), DATEN);

    assert.deepEqual(await masse(png), { breite: mass.breite, hoehe: mass.hoehe }, `Format ${name}`);
  }
});

test('eine eigene Grösse wird genau übernommen', async () => {
  const png = await rendere(vorlage({ format: 'eigen', breite: 800, hoehe: 250 }), DATEN);

  assert.deepEqual(await masse(png), { breite: 800, hoehe: 250 });
});

test('eine unsinnige eigene Grösse wird auf brauchbare Werte gebracht', async () => {
  const png = await rendere(vorlage({ format: 'eigen', breite: 0, hoehe: -5 }), DATEN);
  const gemessen = await masse(png);

  assert.ok(gemessen.breite >= 1 && gemessen.hoehe >= 1);
});

test('die Grundfarbe füllt die Fläche', async () => {
  const png = await rendere(vorlage({ grundfarbe: '#4b57e8' }), DATEN);

  assert.ok(istFarbe(await pixelAus(png, 10, 10), '#4b57e8'));
});

test('die Abdunklung macht die Fläche dunkler, ohne sie zu verfärben', async () => {
  const hell = await pixelAus(await rendere(vorlage({ grundfarbe: '#808080', abdunklung: 0 }), DATEN), 10, 10);
  const dunkel = await pixelAus(await rendere(vorlage({ grundfarbe: '#808080', abdunklung: 50 }), DATEN), 10, 10);

  assert.ok(dunkel[0] < hell[0], 'Die Fläche wurde nicht dunkler');
  assert.ok(Math.abs(dunkel[0] - dunkel[1]) <= 2 && Math.abs(dunkel[1] - dunkel[2]) <= 2, 'Farbstich');
});

test('volle Abdunklung ergibt Schwarz', async () => {
  const png = await rendere(vorlage({ grundfarbe: '#ffffff', abdunklung: 100 }), DATEN);

  assert.ok(istFarbe(await pixelAus(png, 10, 10), '#000000'));
});

test('das Profilbild wird gezeichnet, wo es hingehört', async () => {
  const png = await rendere(
    vorlage({
      grundfarbe: '#000000', avatarAn: true, avatarX: 100, avatarY: 100,
      avatarGroesse: 120, avatarForm: 'eckig',
    }),
    { ...DATEN, avatarBild: testBild('#ff0000') },
  );

  assert.ok(istFarbe(await pixelAus(png, 160, 160), '#ff0000'), 'Im Profilbild fehlt die Farbe');
  assert.ok(istFarbe(await pixelAus(png, 10, 10), '#000000'), 'Ausserhalb ist es nicht der Grund');
});

test('ist das Profilbild abgeschaltet, wird nichts gezeichnet', async () => {
  const png = await rendere(
    vorlage({ grundfarbe: '#000000', avatarAn: false, avatarX: 100, avatarY: 100, avatarGroesse: 120 }),
    { ...DATEN, avatarBild: testBild('#ff0000') },
  );

  assert.ok(istFarbe(await pixelAus(png, 160, 160), '#000000'));
});

test('ein rundes Profilbild lässt die Ecken frei', async () => {
  const png = await rendere(
    vorlage({
      grundfarbe: '#000000', avatarAn: true, avatarX: 100, avatarY: 100,
      avatarGroesse: 120, avatarForm: 'rund',
    }),
    { ...DATEN, avatarBild: testBild('#ff0000') },
  );

  assert.ok(istFarbe(await pixelAus(png, 160, 160), '#ff0000'), 'Die Mitte fehlt');
  assert.ok(istFarbe(await pixelAus(png, 103, 103), '#000000'), 'Die Ecke wurde mitgefüllt');
});

test('fehlt das Profilbild, entsteht trotzdem ein Bild', async () => {
  const png = await rendere(vorlage({ avatarAn: true, avatarGroesse: 100 }), DATEN);

  assert.equal(png.subarray(1, 4).toString(), 'PNG');
});

test('Platzhalter in den Textzeilen werden eingesetzt', async () => {
  const ohne = await rendere(
    vorlage({ grundfarbe: '#000000', zeilen: [{ text: '', x: 20, y: 60, groesse: 40, farbe: '#ffffff' }] }),
    DATEN,
  );
  const mit = await rendere(
    vorlage({ grundfarbe: '#000000', zeilen: [{ text: '{user}', x: 20, y: 60, groesse: 40, farbe: '#ffffff' }] }),
    DATEN,
  );

  assert.notDeepEqual(ohne, mit, 'Der Text wurde nicht gezeichnet');
});

test('zu langer Text wird verkleinert, bis er in die erlaubte Breite passt', async () => {
  const { gemessen } = await rendere(
    vorlage({
      zeilen: [{ text: 'x'.repeat(200), x: 20, y: 60, groesse: 80, farbe: '#ffffff', maxBreite: 300 }],
    }),
    DATEN,
    { mitMessung: true },
  );

  assert.ok(gemessen.zeilen[0].groesse < 80, 'Die Schrift wurde nicht verkleinert');
  assert.ok(gemessen.zeilen[0].breite <= 300, 'Der Text passt immer noch nicht');
});

test('Text, der schon passt, wird nicht verkleinert', async () => {
  const { gemessen } = await rendere(
    vorlage({ zeilen: [{ text: 'kurz', x: 20, y: 60, groesse: 40, farbe: '#ffffff', maxBreite: 800 }] }),
    DATEN,
    { mitMessung: true },
  );

  assert.equal(gemessen.zeilen[0].groesse, 40);
});

test('auch ein absurd langer Name bringt die Schrift nicht auf null', async () => {
  const { gemessen } = await rendere(
    vorlage({
      zeilen: [{ text: 'W'.repeat(2000), x: 20, y: 60, groesse: 60, farbe: '#ffffff', maxBreite: 100 }],
    }),
    DATEN,
    { mitMessung: true },
  );

  assert.ok(gemessen.zeilen[0].groesse >= 8, 'Die Schrift wurde unlesbar klein');
});

test('passt es auch klein nicht, wird gekürzt statt über den Rand zu laufen', async () => {
  const { gemessen } = await rendere(
    vorlage({
      zeilen: [{ text: 'W'.repeat(2000), x: 20, y: 60, groesse: 60, farbe: '#ffffff', maxBreite: 100 }],
    }),
    DATEN,
    { mitMessung: true },
  );
  const [zeile] = gemessen.zeilen;

  assert.ok(zeile.breite <= 100, 'Der Text läuft über den Rand');
  assert.match(zeile.text, /…$/, 'Es fehlt das Auslassungszeichen');
  assert.equal(zeile.gekuerzt, true);
});

test('Text, der durch Verkleinern passt, wird nicht gekürzt', async () => {
  const { gemessen } = await rendere(
    vorlage({
      zeilen: [{ text: 'Ein etwas längerer Name', x: 20, y: 60, groesse: 80, farbe: '#ffffff', maxBreite: 400 }],
    }),
    DATEN,
    { mitMessung: true },
  );

  assert.equal(gemessen.zeilen[0].gekuerzt, false);
  assert.ok(!gemessen.zeilen[0].text.includes('…'));
});

test('ein Hintergrundbild überdeckt die Grundfarbe', async () => {
  const png = await rendere(
    vorlage({ grundfarbe: '#000000', hintergrundBild: testBild('#00ff00', 400) }),
    DATEN,
  );

  assert.ok(istFarbe(await pixelAus(png, 10, 10), '#00ff00'));
});

test('ein unbrauchbares Hintergrundbild lässt die Grundfarbe stehen, statt zu scheitern', async () => {
  const png = await rendere(
    vorlage({ grundfarbe: '#123456', hintergrundBild: Buffer.from('kein Bild') }),
    DATEN,
  );

  assert.ok(istFarbe(await pixelAus(png, 10, 10), '#123456'));
});

test('zweimal dasselbe ergibt zweimal dasselbe Bild', async () => {
  const einstellung = vorlage({
    grundfarbe: '#4b57e8',
    zeilen: [{ text: '{user}', x: 20, y: 60, groesse: 40, farbe: '#ffffff' }],
  });

  const eins = await rendere(einstellung, DATEN);
  const zwei = await rendere(einstellung, DATEN);

  assert.ok(eins.equals(zwei), 'Zwei Läufe ergeben unterschiedliche Bilder');
});
