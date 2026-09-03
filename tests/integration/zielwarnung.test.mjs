import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mitApp, GILDE } from '../hilfen/app.mjs';
import { KANALART } from '../hilfen/discord-doppel.mjs';

/**
 * Wenn das gemerkte Ziel verschwindet.
 *
 * Eine Nachricht, die beim Öffnen plötzlich einen Empfänger weniger hat, fällt
 * sonst erst nach dem Senden auf — und dann fehlt sie jemandem. Deshalb steht
 * der Name in der Warnung und nicht nur eine Zahl.
 */

const SITZUNG_COOKIE = 'panel_sitzung';

const SERVER = {
  gildenName: 'Mein Server',
  rollen: [{ id: 'r-neu', name: 'Neu', position: 2 }],
  mitglieder: [
    { id: '4242', name: 'Owner', rollen: [] },
    { id: 'm1', name: 'Anna', rollen: ['r-neu'] },
    { id: 'm2', name: 'Bert', rollen: ['r-neu'] },
  ],
  kanaele: [{ id: 'k1', name: 'willkommen', type: KANALART.TEXT }],
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

const hole = async (basis, pfad, cookie) =>
  (await fetch(`${basis}${pfad}`, { headers: { cookie } })).text();

const mitServer = (fn) => mitApp(fn, { discordServer: SERVER });

test('ein gelöschter Kanal und ein ausgetretenes Mitglied werden benannt', async () => {
  await mitServer(async (u) => {
    const { cookie, csrfToken } = alsOwner(u);

    // Über den echten Weg speichern — nur so entsteht der Namensschnappschuss.
    await post(u.basis, '/nachricht', cookie, [
      ['_csrf', csrfToken], ['art', 'dm'], ['name', 'An zwei Leute'], ['text', 'Hallo'],
      ['empfaenger', 'mitglied:m1'], ['empfaenger', 'mitglied:m2'], ['speichern', 'ja'],
    ]);
    await post(u.basis, '/nachricht', cookie, [
      ['_csrf', csrfToken], ['art', 'kanal'], ['name', 'In den Kanal'], ['text', 'Hallo'],
      ['kanalId', 'k1'], ['speichern', 'ja'],
    ]);

    // Jetzt verschwinden beide vom Server.
    u.doppelServer.mitgliederMap.delete('m1');
    u.doppelServer.kanaeleMap.delete('k1');

    const text = await hole(u.basis, '/nachrichten', cookie);

    assert.match(text, /Nicht mehr auf dem Server: Anna/);
    assert.match(text, /Den Kanal #willkommen gibt es nicht mehr/);
    // Bert ist noch da und wird nicht mitgewarnt.
    assert.doesNotMatch(text, /Nicht mehr auf dem Server: [^<]*Bert/);
  });
});

test('eine gelöschte Rolle wird als Rolle benannt', async () => {
  await mitServer(async (u) => {
    const { cookie, csrfToken } = alsOwner(u);

    await post(u.basis, '/nachricht', cookie, [
      ['_csrf', csrfToken], ['art', 'dm'], ['name', 'An die Neuen'], ['text', 'Hallo'],
      ['empfaenger', 'rolle:r-neu'], ['speichern', 'ja'],
    ]);

    u.doppelServer.rollenMap.delete('r-neu');

    const text = await hole(u.basis, '/nachrichten', cookie);
    assert.match(text, /Nicht mehr vorhanden: die Rolle Neu\./);
  });
});

test('solange alles da ist, warnt nichts', async () => {
  await mitServer(async (u) => {
    const { cookie, csrfToken } = alsOwner(u);

    await post(u.basis, '/nachricht', cookie, [
      ['_csrf', csrfToken], ['art', 'dm'], ['name', 'Alles gut'], ['text', 'Hallo'],
      ['empfaenger', 'mitglied:m1'], ['speichern', 'ja'],
    ]);

    const text = await hole(u.basis, '/nachrichten', cookie);
    assert.doesNotMatch(text, /Nicht mehr/);
    assert.doesNotMatch(text, /gibt es nicht mehr/);
  });
});

test('der gemerkte Kanalname steht auch dann noch da, wenn der Kanal weg ist', async () => {
  await mitServer(async (u) => {
    const { cookie, csrfToken } = alsOwner(u);

    await post(u.basis, '/nachricht', cookie, [
      ['_csrf', csrfToken], ['art', 'kanal'], ['name', 'Kanalsache'], ['text', 'Hallo'],
      ['kanalId', 'k1'], ['speichern', 'ja'],
    ]);
    u.doppelServer.kanaeleMap.delete('k1');

    const text = await hole(u.basis, '/nachrichten', cookie);
    // Das Ziel bleibt lesbar — „#k1" wäre keine Auskunft.
    assert.match(text, /class="ablageziel">#willkommen/);
  });
});

test('eine alte Nachricht ohne Namensschnappschuss warnt trotzdem', async () => {
  // Vorlagen aus der Zeit vor dieser Änderung haben keine gemerkten Namen.
  // Dann steht die Kennung da — das ist weniger, aber immer noch eine Warnung.
  await mitServer(async (u) => {
    const { cookie } = alsOwner(u);
    u.nachrichtenAblage.lege(GILDE, {
      name: 'Von früher', art: 'dm',
      daten: { art: 'dm', text: 'Hallo', empfaenger: ['mitglied:weg-damit'] },
    });

    const text = await hole(u.basis, '/nachrichten', cookie);
    assert.match(text, /Nicht mehr auf dem Server: weg-damit/);
  });
});
