import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { mitApp, GILDE } from '../hilfen/app.mjs';
import { masse, testBild } from '../hilfen/bild.mjs';
import { FORMATE } from '../../src/bilder/renderer.mjs';

const SITZUNG_COOKIE = 'panel_sitzung';

function alsOwner({ sitzungen, konfig }) {
  const { kennung, csrfToken } = sitzungen.lege_an(GILDE, {
    discordUserId: konfig.ownerId, anzeigename: 'Owner',
  });
  return { cookie: `${SITZUNG_COOKIE}=${encodeURIComponent(kennung)}`, csrfToken };
}

function alsBetrachter({ sitzungen }) {
  const { kennung } = sitzungen.lege_an(GILDE, { discordUserId: 'm1', anzeigename: 'Anna' });
  return { cookie: `${SITZUNG_COOKIE}=${encodeURIComponent(kennung)}` };
}

async function post(basis, pfad, cookie, paare) {
  const koerper = new URLSearchParams();
  for (const [name, wert] of paare) koerper.append(name, wert);
  return fetch(`${basis}${pfad}`, {
    method: 'POST',
    redirect: 'manual',
    headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
    body: koerper.toString(),
  });
}

const hole = (basis, pfad, cookie) =>
  fetch(`${basis}${pfad}`, { redirect: 'manual', headers: { cookie } });

/**
 * Vor dem ersten Upload gibt es das Verzeichnis noch gar nicht — genau das ist
 * das erwartete Ergebnis, wenn nichts angenommen wurde.
 */
function abgelegteDateien(verzeichnis) {
  try {
    return readdirSync(verzeichnis);
  } catch {
    return [];
  }
}

/** Die Felder einer vollständigen, gültigen Vorlage. */
const VORLAGE = (name = 'Willkommen', format = 'breit') => [
  ['name', name],
  ['format', format],
  ['grundfarbe', '#2b2d31'],
  ['abdunklung', '40'],
  ['hintergrundAnpassung', 'fuellen'],
  ['avatarAn', 'nein'], ['avatarAn', 'ja'],
  ['avatarForm', 'rund'],
  ['avatarX', '60'], ['avatarY', '120'], ['avatarGroesse', '160'],
  ['avatarRand', '4'], ['avatarRandfarbe', '#ffffff'],
  ['zeileText', 'Willkommen, {user}!'],
  ['zeileX', '260'], ['zeileY', '200'], ['zeileGroesse', '62'],
  ['zeileFarbe', '#ffffff'], ['zeileAusrichtung', 'links'],
  ['zeileMaxBreite', '880'], ['zeileFett', '0'], ['zeileSchatten', '0'],
];

test('die leere Liste sagt, dass es noch keine Vorlage gibt', async () => {
  await mitApp(async (u) => {
    const { cookie } = alsOwner(u);
    const text = await (await hole(u.basis, '/vorlagen', cookie)).text();

    assert.match(text, /Noch keine Bildvorlage/);
    assert.match(text, /\/vorlagen\/neu/);
  });
});

test('ein Betrachter kommt nicht an die Bildvorlagen', async () => {
  await mitApp(
    async (u) => {
      const { cookie } = alsBetrachter(u);
      assert.equal((await hole(u.basis, '/vorlagen', cookie)).status, 403);
      assert.equal((await hole(u.basis, '/vorlagen/neu', cookie)).status, 403);
    },
    { rollen: { m1: ['r-schau'] }, zugriffsregeln: [['r-schau', 'BETRACHTER']] },
  );
});

test('der Editor liefert die Vorschau schon im Bild mit, ohne zweite Anfrage', async () => {
  await mitApp(async (u) => {
    const { cookie } = alsOwner(u);
    const text = await (await hole(u.basis, '/vorlagen/neu', cookie)).text();

    // Ohne JavaScript gibt es keine zweite Anfrage — das Bild steht im HTML.
    assert.match(text, /<img id="vorlagenvorschau" src="data:image\/png;base64,[A-Za-z0-9+/=]+"/);
    assert.match(text, /enctype="multipart\/form-data"/);
  });
});

test('die Vorschau kommt als PNG in der Grösse des gewählten Formats', async () => {
  await mitApp(async (u) => {
    const { cookie, csrfToken } = alsOwner(u);

    const antwort = await post(u.basis, '/vorlagen/vorschau.png', cookie, [
      ['_csrf', csrfToken], ...VORLAGE('Willkommen', 'quadratisch'),
    ]);

    assert.equal(antwort.status, 200);
    assert.match(antwort.headers.get('content-type'), /image\/png/);
    assert.equal(antwort.headers.get('cache-control'), 'no-store');

    const png = Buffer.from(await antwort.arrayBuffer());
    assert.deepEqual(await masse(png), {
      breite: FORMATE.quadratisch.breite,
      hoehe: FORMATE.quadratisch.hoehe,
    });
  });
});

test('eine halbfertige Vorlage ergibt trotzdem eine Vorschau', async () => {
  // Beim Tippen ist die Vorlage ständig unfertig. Eine Vorschau, die dann
  // nichts liefert, wäre genau dann weg, wenn man sie braucht.
  await mitApp(async (u) => {
    const { cookie, csrfToken } = alsOwner(u);

    const antwort = await post(u.basis, '/vorlagen/vorschau.png', cookie, [
      ['_csrf', csrfToken], ['name', ''], ['format', 'breit'], ['grundfarbe', 'noch nichts'],
      ['zeileText', 'Hallo'], ['zeileFarbe', 'auch nicht'], ['zeileGroesse', 'viel'],
    ]);

    assert.equal(antwort.status, 200);
    const png = Buffer.from(await antwort.arrayBuffer());
    assert.deepEqual(await masse(png), { breite: 1200, hoehe: 400 });
  });
});

test('nach 60 Vorschauen in einer Minute ist Schluss', async () => {
  await mitApp(async (u) => {
    const { cookie, csrfToken } = alsOwner(u);
    // Winziges Format: Der Test prüft die Grenze, nicht den Renderer.
    const klein = [['_csrf', csrfToken], ['format', 'eigen'], ['breite', '8'], ['hoehe', '8']];

    let letzte;
    for (let i = 0; i < 61; i += 1) {
      letzte = await post(u.basis, '/vorlagen/vorschau.png', cookie, klein);
      if (letzte.status === 429) break;
      await letzte.arrayBuffer();
    }

    assert.equal(letzte.status, 429);
    assert.match(await letzte.text(), /Zu viele Anfragen/);
  });
});

test('eine gespeicherte Vorlage steht in der Liste und lässt sich wieder öffnen', async () => {
  await mitApp(async (u) => {
    const { cookie, csrfToken } = alsOwner(u);

    const gespeichert = await post(u.basis, '/vorlagen', cookie, [
      ['_csrf', csrfToken], ...VORLAGE(), ['speichern', 'ja'],
    ]);
    assert.equal(gespeichert.status, 303);
    assert.equal(gespeichert.headers.get('location'), '/vorlagen');

    const eintraege = u.bildvorlagen.alle(GILDE);
    assert.equal(eintraege.length, 1);
    assert.equal(eintraege[0].name, 'Willkommen');
    assert.equal(eintraege[0].vorlage.zeilen[0].text, 'Willkommen, {user}!');
    assert.equal(eintraege[0].vorlage.zeilen[0].fett, true);
    assert.equal(eintraege[0].vorlage.avatarAn, true);

    const liste = await (await hole(u.basis, '/vorlagen', cookie)).text();
    assert.match(liste, /Willkommen/);

    const editor = await (await hole(u.basis, `/vorlagen/${eintraege[0].id}`, cookie)).text();
    assert.match(editor, /value="Willkommen, \{user\}!"/);
  });
});

test('ohne Namen wird nicht gespeichert, und das Getippte bleibt stehen', async () => {
  await mitApp(async (u) => {
    const { cookie, csrfToken } = alsOwner(u);

    const antwort = await post(u.basis, '/vorlagen', cookie, [
      ['_csrf', csrfToken], ...VORLAGE(''), ['speichern', 'ja'],
    ]);
    const text = await antwort.text();

    assert.equal(antwort.status, 200);
    assert.equal(u.bildvorlagen.alle(GILDE).length, 0);
    assert.match(text, /Gib der Vorlage einen Namen/);
    // Der Text der Zeile darf beim Fehler nicht verloren gehen.
    assert.match(text, /value="Willkommen, \{user\}!"/);
  });
});

test('Bearbeiten ändert die vorhandene Vorlage, statt eine zweite anzulegen', async () => {
  await mitApp(async (u) => {
    const { cookie, csrfToken } = alsOwner(u);
    const id = u.bildvorlagen.lege(GILDE, { name: 'Alt', vorlage: { zeilen: [] } });

    await post(u.basis, '/vorlagen', cookie, [
      ['_csrf', csrfToken], ['id', String(id)], ...VORLAGE('Neu'), ['speichern', 'ja'],
    ]);

    const eintraege = u.bildvorlagen.alle(GILDE);
    assert.equal(eintraege.length, 1);
    assert.equal(eintraege[0].name, 'Neu');
    assert.equal(eintraege[0].id, id);
  });
});

test('eine Zeile lässt sich ohne JavaScript hinzufügen und wieder entfernen', async () => {
  await mitApp(async (u) => {
    const { cookie, csrfToken } = alsOwner(u);

    const dazu = await post(u.basis, '/vorlagen', cookie, [
      ['_csrf', csrfToken], ...VORLAGE(), ['zeileHinzufuegen', 'ja'],
    ]);
    const mitZwei = await dazu.text();
    assert.match(mitZwei, /Zeile 2/);
    assert.equal(u.bildvorlagen.alle(GILDE).length, 0, 'Ein Knopfdruck hat schon gespeichert');

    const weg = await post(u.basis, '/vorlagen', cookie, [
      ['_csrf', csrfToken], ...VORLAGE(), ['zeileEntfernen', '0'],
    ]);
    const ohne = await weg.text();
    assert.doesNotMatch(ohne, /Zeile 1<\/legend>/);
    assert.match(ohne, /Noch keine Textzeile/);
  });
});

test('eine Zeile lässt sich hinzufügen, bevor die Vorlage einen Namen hat', async () => {
  // Das Namensfeld trägt deshalb kein `required`: Die Browserprüfung würde
  // sonst jeden Knopf des Formulars blockieren, nicht nur „Speichern".
  await mitApp(async (u) => {
    const { cookie, csrfToken } = alsOwner(u);

    const antwort = await post(u.basis, '/vorlagen', cookie, [
      ['_csrf', csrfToken], ...VORLAGE(''), ['zeileHinzufuegen', 'ja'],
    ]);
    const text = await antwort.text();

    assert.equal(antwort.status, 200);
    assert.match(text, /Zeile 2/);
    assert.doesNotMatch(text, /name="name"[^>]*required/);
  });
});

test('ein Variablen-Knopf hängt die Variable an genau seine Zeile', async () => {
  await mitApp(async (u) => {
    const { cookie, csrfToken } = alsOwner(u);

    const antwort = await post(u.basis, '/vorlagen', cookie, [
      ['_csrf', csrfToken], ...VORLAGE(),
      ['zeileText', 'Zweite Zeile'],
      ['zeileX', '60'], ['zeileY', '300'], ['zeileGroesse', '28'],
      ['zeileFarbe', '#ffffff'], ['zeileAusrichtung', 'links'], ['zeileMaxBreite', '0'],
      ['platzhalterEinfuegen', 'zeile1|{guild}'],
    ]);
    const text = await antwort.text();

    assert.match(text, /value="Zweite Zeile\{guild\}"/);
    assert.match(text, /value="Willkommen, \{user\}!"/, 'Die erste Zeile wurde mitverändert');
  });
});

test('eine erfundene Variable wird nicht eingefügt', async () => {
  await mitApp(async (u) => {
    const { cookie, csrfToken } = alsOwner(u);

    const text = await (
      await post(u.basis, '/vorlagen', cookie, [
        ['_csrf', csrfToken], ...VORLAGE(), ['platzhalterEinfuegen', 'zeile0|{rm -rf}'],
      ])
    ).text();

    assert.doesNotMatch(text, /rm -rf/);
  });
});

test('Löschen fragt zurück und passiert nicht ohne Bestätigung', async () => {
  await mitApp(async (u) => {
    const { cookie, csrfToken } = alsOwner(u);
    const id = u.bildvorlagen.lege(GILDE, { name: 'Weg damit', vorlage: { zeilen: [] } });

    const rueckfrage = await (await hole(u.basis, `/vorlagen/${id}/loeschen`, cookie)).text();
    assert.match(rueckfrage, /Weg damit/);
    assert.match(rueckfrage, /Ja, löschen/);

    const ohne = await post(u.basis, `/vorlagen/${id}/loeschen`, cookie, [['_csrf', csrfToken]]);
    assert.equal(ohne.status, 422);
    assert.equal(u.bildvorlagen.alle(GILDE).length, 1, 'Ohne Bestätigung gelöscht');

    const mit = await post(u.basis, `/vorlagen/${id}/loeschen`, cookie, [
      ['_csrf', csrfToken], ['bestaetigt', 'ja'],
    ]);
    assert.equal(mit.status, 303);
    assert.equal(u.bildvorlagen.alle(GILDE).length, 0);
  });
});

test('eine Vorlage, die es nicht gibt, ergibt 404 statt einer leeren Seite', async () => {
  await mitApp(async (u) => {
    const { cookie } = alsOwner(u);
    assert.equal((await hole(u.basis, '/vorlagen/999', cookie)).status, 404);
    assert.equal((await hole(u.basis, '/vorlagen/999/loeschen', cookie)).status, 404);
  });
});

test('„neu" bleibt die neue Vorlage und wird nicht als Kennung gelesen', async () => {
  await mitApp(async (u) => {
    const { cookie } = alsOwner(u);
    const antwort = await hole(u.basis, '/vorlagen/neu', cookie);

    assert.equal(antwort.status, 200);
    assert.match(await antwort.text(), /Neue Bildvorlage/);
  });
});

// ── Hintergrundbild hochladen ────────────────────────────────────────

async function sendeMitDatei(basis, cookie, felder, datei) {
  const formular = new FormData();
  for (const [name, wert] of felder) formular.append(name, wert);
  if (datei) formular.append('hintergrund', new Blob([datei.inhalt]), datei.name);

  return fetch(`${basis}/vorlagen`, {
    method: 'POST', redirect: 'manual', headers: { cookie }, body: formular,
  });
}

test('ein hochgeladenes Bild landet im Verzeichnis und in der Vorlage', async () => {
  await mitApp(async (u) => {
    const { cookie, csrfToken } = alsOwner(u);

    const antwort = await sendeMitDatei(
      u.basis, cookie, [['_csrf', csrfToken], ...VORLAGE()],
      { inhalt: testBild('#123456', 400), name: 'hintergrund.png' },
    );
    const text = await antwort.text();

    assert.equal(antwort.status, 200);
    assert.match(text, /Hintergrundbild übernommen/);

    const dateien = readdirSync(u.bilderVerzeichnis);
    assert.equal(dateien.length, 1);
    // Der Name kommt vom Server, nicht aus dem Formular.
    assert.match(dateien[0], /^[0-9a-f]{32}\.png$/);
    assert.match(text, new RegExp(`name="hintergrundBild" value="${dateien[0]}"`));
  });
});

test('eine umbenannte Nicht-Bilddatei wird abgelehnt', async () => {
  await mitApp(async (u) => {
    const { cookie, csrfToken } = alsOwner(u);

    const antwort = await sendeMitDatei(
      u.basis, cookie, [['_csrf', csrfToken], ...VORLAGE()],
      { inhalt: Buffer.from('#!/bin/sh\necho nein\n'), name: 'harmlos.png' },
    );
    const text = await antwort.text();

    assert.match(text, /kein Bild/i);
    assert.equal(abgelegteDateien(u.bilderVerzeichnis).length, 0);
  });
});

test('eine zu grosse Datei wird gar nicht erst eingelesen', async () => {
  await mitApp(
    async (u) => {
      const { cookie, csrfToken } = alsOwner(u);

      const antwort = await sendeMitDatei(
        u.basis, cookie, [['_csrf', csrfToken], ...VORLAGE()],
        { inhalt: Buffer.alloc(9000, 7), name: 'gross.png' },
      );

      assert.match(await antwort.text(), /grösser als 8 KB/);
      assert.equal(abgelegteDateien(u.bilderVerzeichnis).length, 0);
    },
    { konfig: { uploadMaxBytes: 8192 } },
  );
});

test('ein untergeschobener Dateiname wird nicht zum Pfad', async () => {
  // Der Name in `hintergrundBild` kommt aus einem Formularfeld. Passt er nicht
  // zum vergebenen Muster, entsteht daraus kein Pfad — die Vorschau zeigt dann
  // die Grundfarbe statt eines fremden Bildes.
  await mitApp(async (u) => {
    const { cookie, csrfToken } = alsOwner(u);

    const antwort = await post(u.basis, '/vorlagen/vorschau.png', cookie, [
      ['_csrf', csrfToken], ...VORLAGE(),
      ['hintergrundBild', '../../../../etc/passwd'],
    ]);

    assert.equal(antwort.status, 200);
    assert.match(antwort.headers.get('content-type'), /image\/png/);
  });
});

test('das Hintergrundbild lässt sich wieder entfernen', async () => {
  await mitApp(async (u) => {
    const { cookie, csrfToken } = alsOwner(u);

    const hoch = await sendeMitDatei(
      u.basis, cookie, [['_csrf', csrfToken], ...VORLAGE()],
      { inhalt: testBild('#123456', 64), name: 'egal.png' },
    );
    await hoch.text();
    const [dateiname] = readdirSync(u.bilderVerzeichnis);

    const raus = await post(u.basis, '/vorlagen', cookie, [
      ['_csrf', csrfToken], ...VORLAGE(),
      ['hintergrundBild', dateiname], ['hintergrundEntfernen', 'ja'],
    ]);
    const text = await raus.text();

    assert.match(text, /Hintergrundbild entfernt/);
    assert.match(text, /name="hintergrundBild" value=""/);
  });
});

test('ein Formular mit Anhang braucht dasselbe CSRF-Token wie jedes andere', async () => {
  await mitApp(async (u) => {
    const { cookie } = alsOwner(u);

    const antwort = await sendeMitDatei(
      u.basis, cookie, [['_csrf', 'falsch'], ...VORLAGE(), ['speichern', 'ja']],
      { inhalt: testBild(), name: 'egal.png' },
    );

    assert.equal(antwort.status, 403);
    assert.equal(u.bildvorlagen.alle(GILDE).length, 0);
  });
});
