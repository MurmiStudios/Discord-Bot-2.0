import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  vorlageAus, pruefeVorlage, sichereVorlage, neueZeile, GRENZE_VORLAGE,
} from '../../src/bilder/vorlage.mjs';

const MIT_ZWEI_ZEILEN = {
  zeileText: ['Hallo {user}', 'Willkommen'],
  zeileX: ['60', '60'],
  zeileY: ['180', '240'],
  zeileGroesse: ['62', '28'],
  zeileFarbe: ['#ffffff', '#cccccc'],
  zeileAusrichtung: ['links', 'mitte'],
  zeileMaxBreite: ['900', '0'],
};

test('ein nicht angekreuztes Ankreuzfeld heisst nein und nicht „fehlt"', () => {
  // Der Browser schickt ein leeres Ankreuzfeld gar nicht mit. Das versteckte
  // Feld davor kommt immer — ohne es liesse sich ein Haken nie entfernen.
  assert.equal(vorlageAus({ avatarAn: 'nein' }).avatarAn, false);
  assert.equal(vorlageAus({ avatarAn: ['nein', 'ja'] }).avatarAn, true);
});

test('Fett und Schatten gehören zu der Zeile, deren Nummer sie tragen', () => {
  // Nicht über die Reihenfolge: Zeile 0 ohne Haken käme gar nicht mit, und
  // dann läge der Haken von Zeile 1 plötzlich bei Zeile 0.
  const vorlage = vorlageAus({ ...MIT_ZWEI_ZEILEN, zeileFett: ['1'], zeileSchatten: ['0', '1'] });

  assert.deepEqual(
    vorlage.zeilen.map((z) => [z.fett, z.schatten]),
    [[false, true], [true, true]],
  );
});

test('die Zeilen behalten Text, Lage und Ausrichtung', () => {
  const vorlage = vorlageAus(MIT_ZWEI_ZEILEN);

  assert.equal(vorlage.zeilen.length, 2);
  assert.equal(vorlage.zeilen[0].text, 'Hallo {user}');
  assert.equal(vorlage.zeilen[0].y, 180);
  assert.equal(vorlage.zeilen[1].ausrichtung, 'mitte');
  assert.equal(vorlage.zeilen[1].groesse, 28);
});

test('ein untergeschobener Auswahlwert bekommt die Vorgabe', () => {
  const vorlage = vorlageAus({
    format: 'gibtsnicht', avatarForm: 'dreieck', hintergrundAnpassung: 'zaubern',
    zeileText: ['x'], zeileAusrichtung: ['schief'],
  });

  assert.equal(vorlage.format, 'breit');
  assert.equal(vorlage.avatarForm, 'rund');
  assert.equal(vorlage.hintergrundAnpassung, 'fuellen');
  assert.equal(vorlage.zeilen[0].ausrichtung, 'links');
});

test('mehr Zeilen als erlaubt kommen gar nicht erst an', () => {
  const viele = Array.from({ length: GRENZE_VORLAGE.ZEILEN + 5 }, (_, i) => `Zeile ${i}`);
  assert.equal(vorlageAus({ zeileText: viele }).zeilen.length, GRENZE_VORLAGE.ZEILEN);
});

test('ohne Namen wird nicht gespeichert', () => {
  const geprueft = pruefeVorlage('   ', vorlageAus({}));

  assert.equal(geprueft.ok, false);
  assert.ok(geprueft.fehler.some((f) => f.feld === 'name'));
});

test('der Name wird von Leerzeichen befreit, bevor er gespeichert wird', () => {
  assert.equal(pruefeVorlage('  Willkommen  ', vorlageAus({})).name, 'Willkommen');
});

test('eine Farbe, die keine ist, wird gemeldet statt stillschweigend ersetzt', () => {
  const vorlage = vorlageAus({ grundfarbe: 'url(egal)', zeileText: ['x'], zeileFarbe: ['rot'] });
  const geprueft = pruefeVorlage('Test', vorlage);

  assert.equal(geprueft.ok, false);
  assert.ok(geprueft.fehler.some((f) => f.feld === 'grundfarbe'));
  assert.ok(geprueft.fehler.some((f) => f.feld === 'zeile0'));
});

test('eine zu lange Zeile wird gemeldet und nicht gekürzt', () => {
  const lang = 'a'.repeat(GRENZE_VORLAGE.ZEILENTEXT + 1);
  const geprueft = pruefeVorlage('Test', vorlageAus({ zeileText: [lang] }));

  assert.equal(geprueft.ok, false);
  assert.match(geprueft.fehler.find((f) => f.feld === 'zeile0').meldung, /201/);
});

test('eine eigene Grösse ausserhalb der Grenzen wird gemeldet', () => {
  const geprueft = pruefeVorlage(
    'Test', vorlageAus({ format: 'eigen', breite: '99999', hoehe: '0' }),
  );

  assert.equal(geprueft.ok, false);
  assert.ok(geprueft.fehler.some((f) => f.feld === 'breite'));
  assert.ok(geprueft.fehler.some((f) => f.feld === 'hoehe'));
});

test('eine vollständige Vorlage geht durch die Prüfung', () => {
  const geprueft = pruefeVorlage('Willkommen', vorlageAus({ ...MIT_ZWEI_ZEILEN, avatarAn: ['nein', 'ja'] }));

  assert.deepEqual(geprueft.fehler, []);
  assert.equal(geprueft.ok, true);
});

test('sichereVorlage lässt nur geprüfte Farben und Zahlen zum Renderer durch', () => {
  const sicher = sichereVorlage({
    ...vorlageAus({ zeileText: ['x'] }),
    grundfarbe: 'url(https://beispiel.test/x.png)',
    abdunklung: 5000,
    avatarGroesse: Number.NaN,
    zeilen: [{ text: 'x', farbe: 'javascript:alert(1)', groesse: 1e9, x: 1e9, y: -1e9, ausrichtung: 'x' }],
  });

  assert.equal(sicher.grundfarbe, '#2b2d31');
  assert.equal(sicher.abdunklung, 100);
  assert.equal(sicher.avatarGroesse, 160);
  assert.equal(sicher.zeilen[0].farbe, '#ffffff');
  assert.equal(sicher.zeilen[0].groesse, GRENZE_VORLAGE.SCHRIFT_MAX);
  assert.equal(sicher.zeilen[0].x, 8192);
  assert.equal(sicher.zeilen[0].y, -4096);
  assert.equal(sicher.zeilen[0].ausrichtung, 'links');
});

test('eine neue Zeile liegt nicht genau auf einer vorhandenen', () => {
  // Sonst sieht der Editor nach „nichts passiert" aus: Zwei Zeilen an
  // derselben Stelle sind im Bild eine unlesbare Überlagerung.
  const vorlage = vorlageAus(MIT_ZWEI_ZEILEN);
  const dritte = neueZeile(vorlage);

  assert.equal(dritte.text, '');
  assert.ok(
    vorlage.zeilen.every((z) => z.y !== dritte.y),
    'Die neue Zeile liegt genau auf einer vorhandenen',
  );
});
