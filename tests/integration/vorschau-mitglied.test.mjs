import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mitApp, GILDE } from '../hilfen/app.mjs';
import { masse, testBild } from '../hilfen/bild.mjs';

/**
 * Vorschau mit einem echten Profil.
 *
 * Beispieldaten beantworten die Frage nicht, auf die es ankommt: Passt die
 * Vorlage auch bei diesem Namen? Deshalb prüft diese Datei vor allem den
 * unbequemen Fall — einen Anzeigenamen, der viel zu lang ist.
 */

const SITZUNG_COOKIE = 'panel_sitzung';
const LANGER_NAME = 'Bartholomäus Maximilian von und zu Hohenzollern-Sigmaringen der Dritte';

const SERVER = {
  gildenName: 'Mein Server',
  rollen: [{ id: 'r-verifiziert', name: 'Verifiziert', position: 3 }],
  mitglieder: [
    { id: '4242', name: 'Owner', rollen: [] },
    { id: 'm1', name: 'Anna Kurz', rollen: ['r-verifiziert'] },
    { id: 'm2', name: LANGER_NAME, rollen: ['r-verifiziert'] },
    { id: 'b1', name: 'Ein Bot', rollen: [], bot: true },
  ],
};

function alsOwner({ sitzungen, konfig }) {
  const { kennung, csrfToken } = sitzungen.lege_an(GILDE, {
    discordUserId: konfig.ownerId, anzeigename: 'Owner',
  });
  return { cookie: `${SITZUNG_COOKIE}=${encodeURIComponent(kennung)}`, csrfToken };
}

async function post(basis, pfad, cookie, paare) {
  const koerper = new URLSearchParams();
  for (const [name, wert] of paare) koerper.append(name, wert);
  return fetch(`${basis}${pfad}`, {
    method: 'POST', redirect: 'manual',
    headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
    body: koerper.toString(),
  });
}

const VORLAGE = [
  ['name', 'Willkommen'], ['format', 'breit'],
  ['grundfarbe', '#2b2d31'], ['abdunklung', '0'], ['hintergrundAnpassung', 'fuellen'],
  ['avatarAn', 'nein'], ['avatarAn', 'ja'], ['avatarForm', 'rund'],
  ['avatarX', '60'], ['avatarY', '120'], ['avatarGroesse', '160'],
  ['avatarRand', '0'], ['avatarRandfarbe', '#ffffff'],
  ['zeileText', 'Willkommen, {user}! Du bist Nummer {count} auf {guild}. Rolle: {role}, Tag: {tag}'],
  ['zeileX', '260'], ['zeileY', '200'], ['zeileGroesse', '48'],
  ['zeileFarbe', '#ffffff'], ['zeileAusrichtung', 'links'], ['zeileMaxBreite', '880'],
];

const mitServer = (fn, extra = {}) => mitApp(fn, { discordServer: SERVER, ...extra });

test('ohne Auswahl steht die Vorschau auf Beispieldaten', async () => {
  await mitServer(async (u) => {
    const { cookie } = alsOwner(u);
    const text = await (await fetch(`${u.basis}/vorlagen/neu`, { headers: { cookie } })).text();

    assert.match(text, /Vorschau mit einem echten Mitglied/);
    assert.doesNotMatch(text, /Vorschau mit <strong>/);
  });
});

test('die Suche findet Mitglieder und lässt Bots weg', async () => {
  await mitServer(async (u) => {
    const { cookie, csrfToken } = alsOwner(u);

    const text = await (
      await post(u.basis, '/vorlagen', cookie, [
        ['_csrf', csrfToken], ...VORLAGE, ['vorschauSuche', 'n'], ['vorschauSuchen', 'ja'],
      ])
    ).text();

    assert.match(text, /name="vorschauMitglied" value="m1"/);
    assert.doesNotMatch(text, /name="vorschauMitglied" value="b1"/, 'Ein Bot steht zur Auswahl');
  });
});

test('ohne Suchbegriff wird nicht die ganze Mitgliederliste ausgeschüttet', async () => {
  await mitServer(async (u) => {
    const { cookie, csrfToken } = alsOwner(u);

    const text = await (
      await post(u.basis, '/vorlagen', cookie, [
        ['_csrf', csrfToken], ...VORLAGE, ['vorschauSuche', ''], ['vorschauSuchen', 'ja'],
      ])
    ).text();

    assert.doesNotMatch(text, /name="vorschauMitglied"/);
  });
});

test('ein gewähltes Mitglied steht in der Vorschau und lässt sich wieder lösen', async () => {
  await mitServer(async (u) => {
    const { cookie, csrfToken } = alsOwner(u);

    const gewaehlt = await (
      await post(u.basis, '/vorlagen', cookie, [
        ['_csrf', csrfToken], ...VORLAGE, ['vorschauMitglied', 'm1'],
      ])
    ).text();

    assert.match(gewaehlt, /Vorschau mit <strong>Anna Kurz<\/strong>/);
    assert.match(gewaehlt, /name="vorschauMitgliedId" value="m1"/);

    const geloest = await (
      await post(u.basis, '/vorlagen', cookie, [
        ['_csrf', csrfToken], ...VORLAGE,
        ['vorschauMitgliedId', 'm1'], ['vorschauMitgliedLoesen', 'ja'],
      ])
    ).text();

    assert.match(geloest, /name="vorschauMitgliedId" value=""/);
    assert.doesNotMatch(geloest, /Vorschau mit <strong>/);
  });
});

test('ein sehr langer Anzeigename sprengt das Bild nicht', async () => {
  // Der Grund für diesen Test: Ein Name aus den Beispieldaten ist immer kurz.
  // Erst ein echter zeigt, ob die Vorlage hält.
  await mitServer(async (u) => {
    const { cookie, csrfToken } = alsOwner(u);

    const antwort = await post(u.basis, '/vorlagen/vorschau.png', cookie, [
      ['_csrf', csrfToken], ...VORLAGE, ['vorschauMitgliedId', 'm2'],
    ]);
    const png = Buffer.from(await antwort.arrayBuffer());

    assert.equal(antwort.status, 200);
    // Das Bild behält seine Größe — der Renderer verkleinert die Schrift und
    // kürzt notfalls, statt über den Rand zu laufen.
    assert.deepEqual(await masse(png), { breite: 1200, hoehe: 400 });
  });
});

test('die Vorschau zeigt wirklich das gewählte Profil und nicht immer dasselbe', async () => {
  await mitServer(async (u) => {
    const { cookie, csrfToken } = alsOwner(u);

    const hole = async (paare) => {
      const antwort = await post(u.basis, '/vorlagen/vorschau.png', cookie, [
        ['_csrf', csrfToken], ...VORLAGE, ...paare,
      ]);
      return Buffer.from(await antwort.arrayBuffer());
    };

    const beispiel = await hole([]);
    const anna = await hole([['vorschauMitgliedId', 'm1']]);
    const lang = await hole([['vorschauMitgliedId', 'm2']]);

    assert.notEqual(anna.toString('base64'), beispiel.toString('base64'), 'Beispieldaten geblieben');
    assert.notEqual(anna.toString('base64'), lang.toString('base64'), 'Beide Namen sehen gleich aus');
  });
});

test('die Vorlage merkt sich das Vorschau-Mitglied nicht', async () => {
  // Mit wem man die Vorschau ansieht, ist eine Frage des Moments und gehört
  // nicht in die gespeicherte Vorlage.
  await mitServer(async (u) => {
    const { cookie, csrfToken } = alsOwner(u);

    await post(u.basis, '/vorlagen', cookie, [
      ['_csrf', csrfToken], ...VORLAGE,
      ['vorschauMitgliedId', 'm1'], ['vorschauSuche', 'Anna'], ['speichern', 'ja'],
    ]);

    const [eintrag] = u.bildvorlagen.alle(GILDE);
    const gespeichert = JSON.stringify(eintrag.vorlage);

    assert.doesNotMatch(gespeichert, /m1|Anna|mitgliedId|vorschau/i);
  });
});

test('eine Kennung, die es nicht gibt, führt zurück zu den Beispieldaten', async () => {
  await mitServer(async (u) => {
    const { cookie, csrfToken } = alsOwner(u);

    const antwort = await post(u.basis, '/vorlagen', cookie, [
      ['_csrf', csrfToken], ...VORLAGE, ['vorschauMitglied', 'gibt-es-nicht'],
    ]);

    assert.equal(antwort.status, 200);
    assert.doesNotMatch(await antwort.text(), /Vorschau mit <strong>/);
  });
});

test('ein nicht ladbares Profilbild wird gesagt, nicht ersetzt', async () => {
  await mitServer(
    async (u) => {
      const { cookie, csrfToken } = alsOwner(u);

      const text = await (
        await post(u.basis, '/vorlagen', cookie, [
          ['_csrf', csrfToken], ...VORLAGE, ['vorschauMitglied', 'm1'],
        ])
      ).text();

      assert.match(text, /Profilbild liess sich nicht von Discord laden/);
    },
    { avatarHolen: async () => ({ ok: false, arrayBuffer: async () => Buffer.alloc(0) }) },
  );
});

test('das Profilbild wird nur von Discords Bildserver geholt', async () => {
  const versuche = [];
  await mitServer(
    async (u) => {
      const { cookie, csrfToken } = alsOwner(u);
      await post(u.basis, '/vorlagen', cookie, [
        ['_csrf', csrfToken], ...VORLAGE, ['vorschauMitglied', 'm1'],
      ]);

      assert.ok(versuche.length > 0, 'Es wurde gar kein Profilbild geholt');
      for (const adresse of versuche) {
        assert.match(adresse, /^https:\/\/cdn\.discordapp\.com\//);
      }
    },
    {
      avatarHolen: async (adresse) => {
        versuche.push(adresse);
        return { ok: true, arrayBuffer: async () => testBild('#5865f2', 128) };
      },
    },
  );
});
