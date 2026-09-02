import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { pruefeUpload, UploadFehler } from '../../src/bilder/upload.mjs';
import { mitTempVerzeichnis } from '../hilfen/db.mjs';
import { testBild } from '../hilfen/bild.mjs';

const KONFIG = { uploadMaxBytes: 5 * 1024 * 1024, uploadMaxKante: 4096 };

async function mitAblage(fn, konfig = KONFIG) {
  return mitTempVerzeichnis(async (dir) => {
    const ziel = join(dir, 'uploads');
    return fn({ ziel, pruefe: (puffer, name) => pruefeUpload(puffer, name, { ...konfig, verzeichnis: ziel }) });
  });
}

test('ein gültiges PNG wird angenommen und bekommt einen Namen vom Server', async () => {
  await mitAblage(async ({ ziel, pruefe }) => {
    const ergebnis = await pruefe(testBild('#00ff00', 200), 'meins.png');

    assert.match(ergebnis.dateiname, /^[a-f0-9]{32}\.png$/);
    assert.ok(existsSync(join(ziel, ergebnis.dateiname)));
  });
});

test('der vom Nutzer gewählte Name landet nirgends im Dateinamen', async () => {
  await mitAblage(async ({ pruefe }) => {
    const ergebnis = await pruefe(testBild('#00ff00', 200), 'mein-name.png');

    assert.ok(!ergebnis.dateiname.includes('mein-name'));
  });
});

test('zwei gleiche Bilder bekommen verschiedene Namen', async () => {
  await mitAblage(async ({ pruefe }) => {
    const eins = await pruefe(testBild('#00ff00', 200), 'a.png');
    const zwei = await pruefe(testBild('#00ff00', 200), 'a.png');

    assert.notEqual(eins.dateiname, zwei.dateiname);
  });
});

test('eine umbenannte Textdatei wird am Inhalt erkannt, nicht an der Endung', async () => {
  await mitAblage(async ({ pruefe }) => {
    await assert.rejects(
      () => pruefe(Buffer.from('Das ist kein Bild, sondern Text.'), 'boese.png'),
      (fehler) => {
        assert.ok(fehler instanceof UploadFehler);
        assert.match(fehler.message, /Bild/i);
        return true;
      },
    );
  });
});

test('eine zu grosse Datei wird abgelehnt und die Grenze genannt', async () => {
  await mitAblage(
    async ({ pruefe }) => {
      await assert.rejects(
        () => pruefe(testBild('#00ff00', 400), 'gross.png'),
        (fehler) => {
          assert.match(fehler.message, /gross|groß/i);
          return true;
        },
      );
    },
    { ...KONFIG, uploadMaxBytes: 100 },
  );
});

test('ein Bild mit zu langer Kante wird abgelehnt', async () => {
  await mitAblage(
    async ({ pruefe }) => {
      await assert.rejects(
        () => pruefe(testBild('#00ff00', 300), 'lang.png'),
        (fehler) => {
          assert.match(fehler.message, /Kante|Pixel|breit|hoch/i);
          return true;
        },
      );
    },
    { ...KONFIG, uploadMaxKante: 100 },
  );
});

test('aus dem Upload-Verzeichnis führt kein Weg heraus', async () => {
  await mitAblage(async ({ ziel, pruefe }) => {
    for (const name of ['../../.env', '..%2f..%2fboese.png', '/etc/passwd.png', 'a/../../b.png']) {
      const ergebnis = await pruefe(testBild('#00ff00', 100), name);

      assert.ok(!ergebnis.dateiname.includes('/'), `${name} ergab einen Pfad`);
      assert.ok(!ergebnis.dateiname.includes('..'), `${name} ergab einen Aufstieg`);
      assert.ok(existsSync(join(ziel, ergebnis.dateiname)));
    }
  });
});

test('ein leerer Upload wird abgelehnt', async () => {
  await mitAblage(async ({ pruefe }) => {
    await assert.rejects(() => pruefe(Buffer.alloc(0), 'leer.png'));
  });
});

test('JPEG und WebP werden ebenfalls angenommen', async () => {
  await mitAblage(async ({ pruefe }) => {
    const { createCanvas } = await import('@napi-rs/canvas');
    const leinwand = createCanvas(100, 100);
    leinwand.getContext('2d').fillRect(0, 0, 100, 100);

    const jpeg = await pruefe(leinwand.toBuffer('image/jpeg'), 'b.jpg');
    assert.match(jpeg.dateiname, /\.jpg$/);

    const webp = await pruefe(leinwand.toBuffer('image/webp'), 'c.webp');
    assert.match(webp.dateiname, /\.webp$/);
  });
});

test('die Endung folgt dem erkannten Inhalt, nicht dem gelieferten Namen', async () => {
  await mitAblage(async ({ pruefe }) => {
    const ergebnis = await pruefe(testBild('#00ff00', 100), 'behauptet.jpg');

    assert.match(ergebnis.dateiname, /\.png$/, 'Die Endung stammt aus dem Namen statt aus dem Inhalt');
  });
});

test('die Masse des Bildes werden mitgeliefert', async () => {
  await mitAblage(async ({ pruefe }) => {
    const ergebnis = await pruefe(testBild('#00ff00', 123), 'a.png');

    assert.equal(ergebnis.breite, 123);
    assert.equal(ergebnis.hoehe, 123);
  });
});

test('die abgelegte Datei ist inhaltlich das, was hochgeladen wurde', async () => {
  await mitAblage(async ({ ziel, pruefe }) => {
    const puffer = testBild('#00ff00', 100);
    const ergebnis = await pruefe(puffer, 'a.png');

    assert.ok(readFileSync(join(ziel, ergebnis.dateiname)).equals(puffer));
  });
});
