import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mitApp, GILDE } from '../hilfen/app.mjs';
import { KANALART } from '../hilfen/discord-doppel.mjs';

const SITZUNG_COOKIE = 'panel_sitzung';

const SERVER = {
  gildenName: 'Mein Server',
  rollen: [{ id: 'r-neu', name: 'Neu', position: 2 }],
  mitglieder: [
    { id: '4242', name: 'Owner', rollen: [] },
    { id: 'm1', name: 'Anna', rollen: ['r-neu'] },
  ],
  kanaele: [{ id: 'k1', name: 'willkommen', type: KANALART.TEXT }],
};

/** Eine vollständige Nachricht: Text, Embed, Bildvorlage, Ziel. */
const VOLL = (bildvorlageId) => ({
  art: 'dm',
  text: 'Hallo {user}!',
  bildvorlageId: String(bildvorlageId ?? ''),
  kanalId: '',
  empfaenger: ['mitglied:m1', 'rolle:r-neu'],
  embedAn: 'ja',
  embedTitel: 'Deine ersten Schritte',
  embedBeschreibung: 'Lies bitte die Regeln.',
  embedFusszeile: 'Automatisch',
  embedAutor: 'Das Team',
  embedFarbe: '#4b57e8',
  embedFeldName: ['Regeln'],
  embedFeldWert: ['#regeln'],
});

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

const holeAntwort = (basis, pfad, cookie) =>
  fetch(`${basis}${pfad}`, { redirect: 'manual', headers: { cookie } });
const hole = async (basis, pfad, cookie) => (await holeAntwort(basis, pfad, cookie)).text();

const mitServer = (fn, extra = {}) => mitApp(fn, { discordServer: SERVER, ...extra });

test('Öffnen lädt Text, Embed, Bildvorlage und Ziel gemeinsam in den Editor', async () => {
  await mitServer(async (u) => {
    const { cookie } = alsOwner(u);
    const bildId = u.bildvorlagen.lege(GILDE, { name: 'Banner', vorlage: { zeilen: [] } });
    const id = u.nachrichtenAblage.lege(GILDE, {
      name: 'Willkommensgruss', art: 'dm', daten: VOLL(bildId),
    });

    const text = await hole(u.basis, `/nachricht?laden=${id}`, cookie);

    assert.match(text, /Hallo \{user\}!/);
    assert.match(text, /value="Deine ersten Schritte"/);
    assert.match(text, /Lies bitte die Regeln\./);
    assert.match(text, /value="Willkommensgruss"/);
    assert.match(text, new RegExp(`<option value="${bildId}" selected>`));
    // Das gemerkte Ziel: beide Einträge stehen wieder als Auswahl da.
    assert.match(text, /name="empfaenger" value="mitglied:m1"/);
    assert.match(text, /name="empfaenger" value="rolle:r-neu"/);
    assert.match(text, new RegExp(`name="gespeichertId" value="${id}"`));
  });
});

test('Speichern einer geöffneten Nachricht überschreibt sie, statt zu verdoppeln', async () => {
  await mitServer(async (u) => {
    const { cookie, csrfToken } = alsOwner(u);
    const id = u.nachrichtenAblage.lege(GILDE, {
      name: 'Erst so', art: 'dm', notiz: 'Meine Notiz', daten: VOLL(),
    });

    await post(u.basis, '/nachricht', cookie, [
      ['_csrf', csrfToken], ['gespeichertId', String(id)], ['art', 'dm'],
      ['name', 'Dann so'], ['text', 'Neuer Text'], ['speichern', 'ja'],
    ]);

    const alle = u.nachrichtenAblage.alle(GILDE);
    assert.equal(alle.length, 1, 'Es ist eine zweite Fassung entstanden');
    assert.equal(alle[0].name, 'Dann so');
    assert.equal(alle[0].daten.text, 'Neuer Text');
    assert.equal(alle[0].notiz, 'Meine Notiz', 'Die Notiz ging beim Speichern verloren');
  });
});

test('eine Kopie ist unabhängig vom Original', async () => {
  await mitServer(async (u) => {
    const { cookie, csrfToken } = alsOwner(u);
    const id = u.nachrichtenAblage.lege(GILDE, { name: 'Vorlage', art: 'dm', daten: VOLL() });

    const antwort = await post(u.basis, `/nachrichten/${id}/kopie`, cookie, [['_csrf', csrfToken]]);
    assert.equal(antwort.status, 303);

    const alle = u.nachrichtenAblage.alle(GILDE);
    assert.equal(alle.length, 2);
    const kopie = alle.find((e) => e.id !== id);
    assert.equal(kopie.name, 'Vorlage (Kopie)');

    // Die Kopie ändern lässt das Original unberührt.
    await post(u.basis, `/nachrichten/${kopie.id}`, cookie, [
      ['_csrf', csrfToken], ['name', 'Ganz anders'], ['art', 'kanal'], ['notiz', 'nur hier'],
    ]);

    const original = u.nachrichtenAblage.lies(GILDE, id);
    assert.equal(original.name, 'Vorlage');
    assert.equal(original.art, 'dm');
    assert.equal(original.notiz, '');
    assert.equal(original.daten.text, 'Hallo {user}!');
  });
});

test('ein Art-Wechsel behält den Text und wirkt auch im Editor', async () => {
  await mitServer(async (u) => {
    const { cookie, csrfToken } = alsOwner(u);
    const id = u.nachrichtenAblage.lege(GILDE, { name: 'Wechsler', art: 'dm', daten: VOLL() });

    await post(u.basis, `/nachrichten/${id}`, cookie, [
      ['_csrf', csrfToken], ['name', 'Wechsler'], ['art', 'kanal'], ['notiz', ''],
    ]);

    const eintrag = u.nachrichtenAblage.lies(GILDE, id);
    assert.equal(eintrag.art, 'kanal');
    assert.equal(eintrag.daten.text, 'Hallo {user}!', 'Der Text ging beim Wechsel verloren');
    // Spalte und Inhalt müssen zusammenpassen, sonst öffnet der Editor die alte Art.
    assert.equal(eintrag.daten.art, 'kanal');

    const editor = await hole(u.basis, `/nachricht?laden=${id}`, cookie);
    assert.match(editor, /<input type="hidden" name="art" value="kanal">/);
    assert.match(editor, /Hallo \{user\}!/);
  });
});

test('Umbenennen und Notiz landen in der Karte', async () => {
  await mitServer(async (u) => {
    const { cookie, csrfToken } = alsOwner(u);
    const id = u.nachrichtenAblage.lege(GILDE, { name: 'Alt', art: 'dm', daten: VOLL() });

    await post(u.basis, `/nachrichten/${id}`, cookie, [
      ['_csrf', csrfToken], ['name', 'Neu benannt'], ['art', 'dm'],
      ['notiz', 'Nur für neue Mitglieder'],
    ]);

    const text = await hole(u.basis, '/nachrichten', cookie);
    assert.match(text, /class="ablagename">Neu benannt/);
    assert.match(text, /Nur für neue Mitglieder/);
  });
});

test('ein leerer Name beim Umbenennen lässt den alten stehen', async () => {
  await mitServer(async (u) => {
    const { cookie, csrfToken } = alsOwner(u);
    const id = u.nachrichtenAblage.lege(GILDE, { name: 'Bleibt', art: 'dm', daten: VOLL() });

    await post(u.basis, `/nachrichten/${id}`, cookie, [
      ['_csrf', csrfToken], ['name', '   '], ['art', 'dm'], ['notiz', ''],
    ]);

    assert.equal(u.nachrichtenAblage.lies(GILDE, id).name, 'Bleibt');
  });
});

test('Löschen fragt zurück und passiert nicht ohne Bestätigung', async () => {
  await mitServer(async (u) => {
    const { cookie, csrfToken } = alsOwner(u);
    const id = u.nachrichtenAblage.lege(GILDE, { name: 'Weg damit', art: 'dm', daten: VOLL() });

    const rueckfrage = await hole(u.basis, `/nachrichten/${id}/loeschen`, cookie);
    assert.match(rueckfrage, /Weg damit/);
    assert.match(rueckfrage, /Ja, löschen/);

    const ohne = await post(u.basis, `/nachrichten/${id}/loeschen`, cookie, [['_csrf', csrfToken]]);
    assert.equal(ohne.status, 422);
    assert.equal(u.nachrichtenAblage.alle(GILDE).length, 1);

    const mit = await post(u.basis, `/nachrichten/${id}/loeschen`, cookie, [
      ['_csrf', csrfToken], ['bestaetigt', 'ja'],
    ]);
    assert.equal(mit.status, 303);
    assert.equal(u.nachrichtenAblage.alle(GILDE).length, 0);
  });
});

test('eine Nachricht, die es nicht gibt, ergibt 404 statt eines leeren Editors', async () => {
  await mitServer(async (u) => {
    const { cookie } = alsOwner(u);

    assert.equal((await holeAntwort(u.basis, '/nachricht?laden=999', cookie)).status, 404);
    assert.equal((await holeAntwort(u.basis, '/nachrichten/999/loeschen', cookie)).status, 404);
  });
});

test('eine Nachricht eines anderen Servers lässt sich nicht öffnen', async () => {
  await mitServer(async (u) => {
    const { cookie } = alsOwner(u);
    u.gilden.merke('999999999999999999', 'Fremd');
    const fremd = u.nachrichtenAblage.lege('999999999999999999', {
      name: 'Fremdsache', art: 'dm', daten: VOLL(),
    });

    const antwort = await holeAntwort(u.basis, `/nachricht?laden=${fremd}`, cookie);
    assert.equal(antwort.status, 404);
  });
});

test('eine geöffnete Nachricht lässt sich unverändert wieder senden', async () => {
  await mitServer(async (u) => {
    const { cookie, csrfToken } = alsOwner(u);
    const id = u.nachrichtenAblage.lege(GILDE, {
      name: 'Nochmal', art: 'dm', daten: { ...VOLL(), empfaenger: ['mitglied:m1'] },
    });

    // So, wie das geladene Formular es abschickt.
    await post(u.basis, '/versand/starten', cookie, [
      ['_csrf', csrfToken], ['gespeichertId', String(id)], ['art', 'dm'],
      ['name', 'Nochmal'], ['text', 'Hallo {user}!'],
      ['empfaenger', 'mitglied:m1'], ['bestaetigt', 'ja'],
    ]);
    await u.warteAufVersand();

    assert.equal(u.doppelServer.gesendet.length, 1);
    assert.equal(u.doppelServer.gesendet[0].nutzlast.content, 'Hallo Anna!');
    // Und es ist keine zweite Fassung entstanden.
    assert.equal(u.nachrichtenAblage.alle(GILDE).length, 1);
  });
});
