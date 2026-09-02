import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mitApp, GILDE } from '../hilfen/app.mjs';
import { hatInhalt } from '../hilfen/bild.mjs';

/**
 * Position ohne JavaScript.
 *
 * Verschieben in der Vorschau ist eine Zugabe; der verbindliche Weg sind die
 * Zahlenfelder. Genau den prüft diese Datei: Was in `avatarX` und `avatarY`
 * steht, muss sich im gerenderten Bild wiederfinden — sonst zeigt der Griff
 * später etwas anderes an, als herauskommt.
 */

const SITZUNG_COOKIE = 'panel_sitzung';
const GRUND = '#000000';

function alsOwner({ sitzungen, konfig }) {
  const { kennung, csrfToken } = sitzungen.lege_an(GILDE, {
    discordUserId: konfig.ownerId, anzeigename: 'Owner',
  });
  return { cookie: `${SITZUNG_COOKIE}=${encodeURIComponent(kennung)}`, csrfToken };
}

/** Grundfeld: schwarze Fläche, kein Text, eckiges Profilbild von 100 Pixeln. */
const BASIS = [
  ['format', 'eigen'], ['breite', '600'], ['hoehe', '400'],
  ['grundfarbe', GRUND], ['abdunklung', '0'], ['hintergrundAnpassung', 'fuellen'],
  ['avatarAn', 'nein'], ['avatarAn', 'ja'],
  ['avatarForm', 'eckig'], ['avatarGroesse', '100'],
  ['avatarRand', '0'], ['avatarRandfarbe', '#ffffff'],
];

async function vorschau(basis, cookie, csrfToken, paare) {
  const koerper = new URLSearchParams();
  for (const [name, wert] of [['_csrf', csrfToken], ...BASIS, ...paare]) koerper.append(name, wert);

  const antwort = await fetch(`${basis}/vorlagen/vorschau.png`, {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
    body: koerper.toString(),
  });
  assert.equal(antwort.status, 200);
  return Buffer.from(await antwort.arrayBuffer());
}

test('das Profilbild liegt dort, wo die Zahlenfelder es hinschicken', async () => {
  await mitApp(async (u) => {
    const { cookie, csrfToken } = alsOwner(u);

    const obenLinks = await vorschau(u.basis, cookie, csrfToken, [['avatarX', '0'], ['avatarY', '0']]);
    const versetzt = await vorschau(u.basis, cookie, csrfToken, [['avatarX', '400'], ['avatarY', '250']]);

    const ecke = { x: 10, y: 10, breite: 80, hoehe: 80 };
    const mitte = { x: 410, y: 260, breite: 80, hoehe: 80 };

    assert.equal(await hatInhalt(obenLinks, ecke, GRUND), true, 'Nichts in der Ecke');
    assert.equal(await hatInhalt(obenLinks, mitte, GRUND), false, 'Profilbild an beiden Stellen');

    assert.equal(await hatInhalt(versetzt, mitte, GRUND), true, 'Profilbild nicht mitgewandert');
    assert.equal(await hatInhalt(versetzt, ecke, GRUND), false, 'Profilbild in der Ecke geblieben');
  });
});

test('eine Textzeile liegt dort, wo die Zahlenfelder sie hinschicken', async () => {
  await mitApp(async (u) => {
    const { cookie, csrfToken } = alsOwner(u);

    const zeile = (x, y) => [
      ['avatarAn', 'nein'],
      ['zeileText', 'Hallo'], ['zeileX', String(x)], ['zeileY', String(y)],
      ['zeileGroesse', '40'], ['zeileFarbe', '#ffffff'],
      ['zeileAusrichtung', 'links'], ['zeileMaxBreite', '0'],
    ];

    const oben = await vorschau(u.basis, cookie, csrfToken, zeile(20, 60));
    const unten = await vorschau(u.basis, cookie, csrfToken, zeile(20, 340));

    // Die Grundlinie liegt unten am Text, deshalb der Streifen darüber.
    const obenBereich = { x: 10, y: 20, breite: 300, hoehe: 50 };
    const untenBereich = { x: 10, y: 300, breite: 300, hoehe: 50 };

    assert.equal(await hatInhalt(oben, obenBereich, GRUND), true, 'Text fehlt oben');
    assert.equal(await hatInhalt(oben, untenBereich, GRUND), false, 'Text steht auch unten');

    assert.equal(await hatInhalt(unten, untenBereich, GRUND), true, 'Text nicht mitgewandert');
    assert.equal(await hatInhalt(unten, obenBereich, GRUND), false, 'Text oben geblieben');
  });
});

test('eine Position ausserhalb des Bildes wird angenommen, nicht verweigert', async () => {
  // Text darf über den Rand hinauslaufen — das ist eine Gestaltungsfrage und
  // kein Fehler. Nur absurde Werte fängt sichereVorlage ab.
  await mitApp(async (u) => {
    const { cookie, csrfToken } = alsOwner(u);

    const png = await vorschau(u.basis, cookie, csrfToken, [
      ['avatarX', '-50'], ['avatarY', '-50'],
    ]);

    assert.equal(
      await hatInhalt(png, { x: 0, y: 0, breite: 40, hoehe: 40 }, GRUND), true,
      'Das angeschnittene Profilbild ist gar nicht zu sehen',
    );
  });
});

test('die Vorschau bleibt bei einer wilden Position ein gültiges Bild', async () => {
  await mitApp(async (u) => {
    const { cookie, csrfToken } = alsOwner(u);

    const png = await vorschau(u.basis, cookie, csrfToken, [
      ['avatarX', '99999999'], ['avatarY', 'nicht-mal-eine-Zahl'],
    ]);

    assert.equal(png.subarray(1, 4).toString('latin1'), 'PNG');
  });
});
