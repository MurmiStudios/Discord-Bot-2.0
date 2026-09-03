import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mitApp, GILDE } from '../hilfen/app.mjs';
import { masse, testBild } from '../hilfen/bild.mjs';
import { KANALART } from '../hilfen/discord-doppel.mjs';

/**
 * Eine Nachricht mit Bildvorlage.
 *
 * Der Kern: je Empfänger ein eigenes Bild. Ein Bild für alle wäre kein Fehler,
 * den man sieht — es sähe genauso aus, nur stünde der falsche Name darauf.
 * Deshalb prüft der erste Test die Bilder gegeneinander und nicht nur, dass
 * überhaupt eines dabei ist.
 */

const SITZUNG_COOKIE = 'panel_sitzung';

const SERVER = {
  gildenName: 'Mein Server',
  rollen: [{ id: 'r-neu', name: 'Neu', position: 2 }],
  mitglieder: [
    { id: '4242', name: 'Owner', rollen: [] },
    { id: 'm1', name: 'Anna', rollen: ['r-neu'] },
    { id: 'm2', name: 'Bertram Langname von Hohenzollern', rollen: ['r-neu'] },
  ],
  kanaele: [{ id: 'k1', name: 'willkommen', type: KANALART.TEXT }],
};

const VORLAGE = {
  format: 'breit',
  grundfarbe: '#2b2d31',
  avatarAn: true, avatarForm: 'rund', avatarX: 60, avatarY: 120, avatarGroesse: 160,
  zeilen: [
    {
      text: 'Willkommen, {user}!', x: 260, y: 200, groesse: 62,
      farbe: '#ffffff', ausrichtung: 'links', maxBreite: 880, fett: true, schatten: true,
    },
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

const mitServer = (fn, extra = {}) => mitApp(fn, { discordServer: SERVER, ...extra });

test('jeder Empfänger bekommt sein eigenes Bild', async () => {
  await mitServer(async (u) => {
    const { cookie, csrfToken } = alsOwner(u);
    const vorlageId = u.bildvorlagen.lege(GILDE, { name: 'Willkommen', vorlage: VORLAGE });

    await post(u.basis, '/versand/starten', cookie, [
      ['_csrf', csrfToken], ['art', 'dm'], ['text', 'Hallo {user}'],
      ['bildvorlageId', String(vorlageId)],
      ['empfaenger', 'mitglied:m1'], ['empfaenger', 'mitglied:m2'],
      ['bestaetigt', 'ja'],
    ]);
    await u.warteAufVersand();

    const dms = u.doppelServer.gesendet.filter((g) => g.art === 'dm');
    assert.equal(dms.length, 2);

    const bilder = dms.map((d) => d.nutzlast.files?.[0]);
    assert.ok(bilder.every(Boolean), 'Eine Nachricht ging ohne Bild raus');
    assert.deepEqual(bilder.map((b) => b.name), ['willkommen.png', 'willkommen.png']);

    // Derselbe Entwurf, zwei Namen: Die Bilder müssen sich unterscheiden.
    assert.notEqual(
      bilder[0].attachment.toString('base64'),
      bilder[1].attachment.toString('base64'),
      'Beide Empfänger haben dasselbe Bild bekommen',
    );

    for (const bild of bilder) {
      assert.deepEqual(await masse(bild.attachment), { breite: 1200, hoehe: 400 });
    }
  });
});

test('ohne gewählte Bildvorlage hängt nichts an der Nachricht', async () => {
  await mitServer(async (u) => {
    const { cookie, csrfToken } = alsOwner(u);

    await post(u.basis, '/versand/starten', cookie, [
      ['_csrf', csrfToken], ['art', 'dm'], ['text', 'Hallo'],
      ['empfaenger', 'mitglied:m1'], ['bestaetigt', 'ja'],
    ]);
    await u.warteAufVersand();

    const [dm] = u.doppelServer.gesendet;
    assert.equal(dm.nutzlast.files, undefined);
    assert.equal(dm.nutzlast.content, 'Hallo');
  });
});

test('eine Bildvorlage allein reicht als Inhalt — ohne Text', async () => {
  await mitServer(async (u) => {
    const { cookie, csrfToken } = alsOwner(u);
    const vorlageId = u.bildvorlagen.lege(GILDE, { name: 'Nur Bild', vorlage: VORLAGE });

    await post(u.basis, '/versand/starten', cookie, [
      ['_csrf', csrfToken], ['art', 'dm'], ['text', ''],
      ['bildvorlageId', String(vorlageId)],
      ['empfaenger', 'mitglied:m1'], ['bestaetigt', 'ja'],
    ]);
    await u.warteAufVersand();

    const [dm] = u.doppelServer.gesendet;
    assert.equal(dm.nutzlast.content, undefined);
    assert.equal(dm.nutzlast.files.length, 1);
    assert.equal(dm.nutzlast.files[0].name, 'nur-bild.png');
  });
});

test('eine Bildvorlage geht auch in einen Kanal', async () => {
  await mitServer(async (u) => {
    const { cookie, csrfToken } = alsOwner(u);
    const vorlageId = u.bildvorlagen.lege(GILDE, { name: 'Banner', vorlage: VORLAGE });

    await post(u.basis, '/versand/starten', cookie, [
      ['_csrf', csrfToken], ['art', 'kanal'], ['kanalId', 'k1'], ['text', 'Neu hier!'],
      ['bildvorlageId', String(vorlageId)], ['bestaetigt', 'ja'],
    ]);
    await u.warteAufVersand();

    const [gesendet] = u.doppelServer.gesendet;
    assert.equal(gesendet.art, 'kanal');
    assert.equal(gesendet.nutzlast.files.length, 1);
  });
});

test('eine gelöschte Bildvorlage wird gemeldet, nicht stillschweigend weggelassen', async () => {
  // Eine Nachricht, die ein Bild ankündigt und ohne ankommt, ist schlimmer als
  // ein sichtbarer Fehlschlag: Auf der Fortschrittsseite steht der Grund.
  await mitServer(async (u) => {
    const { cookie, csrfToken } = alsOwner(u);
    const vorlageId = u.bildvorlagen.lege(GILDE, { name: 'Gleich weg', vorlage: VORLAGE });
    u.bildvorlagen.loesche(GILDE, vorlageId);

    await post(u.basis, '/versand/starten', cookie, [
      ['_csrf', csrfToken], ['art', 'dm'], ['text', 'Hallo'],
      ['bildvorlageId', String(vorlageId)],
      ['empfaenger', 'mitglied:m1'], ['bestaetigt', 'ja'],
    ]);
    await u.warteAufVersand();

    assert.equal(u.doppelServer.gesendet.length, 0, 'Es ging etwas ohne Bild raus');

    const vorgang = u.versandAblage.juengster(GILDE);
    const [ziel] = u.versandAblage.ziele(GILDE, vorgang.id);
    assert.equal(ziel.zustand, 'fehlgeschlagen');
    assert.match(ziel.grund ?? '', /Bildvorlage/);
  });
});

test('eine Bildvorlage eines anderen Servers wird nicht mitgeschickt', async () => {
  await mitServer(async (u) => {
    const { cookie, csrfToken } = alsOwner(u);
    u.gilden.merke('999999999999999999', 'Fremder Server');
    const fremd = u.bildvorlagen.lege('999999999999999999', { name: 'Fremd', vorlage: VORLAGE });

    await post(u.basis, '/versand/starten', cookie, [
      ['_csrf', csrfToken], ['art', 'dm'], ['text', 'Hallo'],
      ['bildvorlageId', String(fremd)],
      ['empfaenger', 'mitglied:m1'], ['bestaetigt', 'ja'],
    ]);
    await u.warteAufVersand();

    assert.equal(u.doppelServer.gesendet.length, 0);
    const vorgang = u.versandAblage.juengster(GILDE);
    const [ziel] = u.versandAblage.ziele(GILDE, vorgang.id);
    assert.equal(ziel.zustand, 'fehlgeschlagen');
  });
});

test('der Editor bietet die gespeicherten Bildvorlagen zur Auswahl an', async () => {
  await mitServer(async (u) => {
    const { cookie } = alsOwner(u);
    u.bildvorlagen.lege(GILDE, { name: 'Willkommensbanner', vorlage: VORLAGE });

    const text = await (await fetch(`${u.basis}/nachricht`, { headers: { cookie } })).text();

    assert.match(text, /<select id="bildvorlageId" name="bildvorlageId">/);
    assert.match(text, /Willkommensbanner/);
  });
});

test('ohne angelegte Vorlage steht der Weg dorthin statt eines leeren Feldes', async () => {
  await mitServer(async (u) => {
    const { cookie } = alsOwner(u);
    const text = await (await fetch(`${u.basis}/nachricht`, { headers: { cookie } })).text();

    assert.doesNotMatch(text, /<select id="bildvorlageId"/);
    assert.match(text, /Noch keine Bildvorlage vorhanden/);
  });
});

test('das Profilbild des Empfängers landet im Bild', async () => {
  const geholt = [];
  await mitServer(
    async (u) => {
      const { cookie, csrfToken } = alsOwner(u);
      const vorlageId = u.bildvorlagen.lege(GILDE, { name: 'Mit Profil', vorlage: VORLAGE });

      await post(u.basis, '/versand/starten', cookie, [
        ['_csrf', csrfToken], ['art', 'dm'], ['text', 'Hallo'],
        ['bildvorlageId', String(vorlageId)],
        ['empfaenger', 'mitglied:m1'], ['bestaetigt', 'ja'],
      ]);
      await u.warteAufVersand();

      assert.deepEqual(geholt, ['https://cdn.discordapp.com/avatars/m1/x.png']);
    },
    {
      avatarHolen: async (adresse) => {
        geholt.push(adresse);
        return { ok: true, arrayBuffer: async () => testBild('#43b581', 128) };
      },
    },
  );
});
