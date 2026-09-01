import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mitApp, GILDE } from '../hilfen/app.mjs';

const SITZUNG_COOKIE = 'panel_sitzung';

const SERVER = {
  rollen: [
    { id: 'r-neu', name: 'Neu', position: 2 },
    { id: 'r-alt', name: 'Alt', position: 3 },
  ],
  mitglieder: [
    { id: 'm1', name: 'Anna', rollen: ['r-neu'] },
    { id: 'm2', name: 'Bert', rollen: ['r-neu', 'r-alt'] },
    { id: 'm3', name: 'Clara', rollen: ['r-alt'] },
    { id: '4242', name: 'Owner', rollen: [] },
  ],
};

function alsOwner({ sitzungen, konfig }) {
  const { kennung, csrfToken } = sitzungen.lege_an(GILDE, {
    discordUserId: konfig.ownerId,
    anzeigename: 'Owner',
  });
  return { cookie: `${SITZUNG_COOKIE}=${encodeURIComponent(kennung)}`, csrfToken };
}

async function sende(basis, cookie, paare) {
  const koerper = new URLSearchParams();
  for (const [name, wert] of paare) koerper.append(name, wert);
  return fetch(`${basis}/nachricht`, {
    method: 'POST',
    redirect: 'manual',
    headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
    body: koerper.toString(),
  });
}

const mitServer = (fn) => mitApp(fn, { discordServer: SERVER });

test('bei einer Direktnachricht gibt es ein Suchfeld für Empfänger', async () => {
  await mitServer(async (u) => {
    const { cookie } = alsOwner(u);

    const text = await (await fetch(`${u.basis}/nachricht?art=dm`, { headers: { cookie } })).text();

    assert.match(text, /name="empfaengerSuche"/);
  });
});

test('die Suche findet Mitglieder und Rollen zugleich', async () => {
  await mitServer(async (u) => {
    const { cookie, csrfToken } = alsOwner(u);

    const text = await (
      await sende(u.basis, cookie, [
        ['_csrf', csrfToken], ['art', 'dm'], ['text', 'x'],
        ['empfaengerSuche', 'a'], ['suchen', 'ja'],
      ])
    ).text();

    assert.match(text, /Anna/);
    assert.match(text, /Clara/);
    assert.match(text, /Alt/);
  });
});

test('ein gewählter Empfänger erscheint als Chip im Feld', async () => {
  await mitServer(async (u) => {
    const { cookie, csrfToken } = alsOwner(u);

    const text = await (
      await sende(u.basis, cookie, [
        ['_csrf', csrfToken], ['art', 'dm'], ['text', 'x'], ['hinzufuegen', 'mitglied:m1'],
      ])
    ).text();

    assert.match(text, /class="chip"[\s\S]{0,200}Anna/);
    assert.ok(text.includes('value="mitglied:m1"'), 'Die Auswahl wird nicht mitgeführt');
  });
});

test('eine Rolle als Chip nennt, wie viele Empfänger daraus werden', async () => {
  await mitServer(async (u) => {
    const { cookie, csrfToken } = alsOwner(u);

    const text = await (
      await sende(u.basis, cookie, [
        ['_csrf', csrfToken], ['art', 'dm'], ['text', 'x'], ['hinzufuegen', 'rolle:r-neu'],
      ])
    ).text();

    assert.match(text, /Neu/);
    assert.match(text, /2\s*(Empfänger|Mitglieder)/i);
  });
});

test('genau der gewählte Chip wird entfernt', async () => {
  await mitServer(async (u) => {
    const { cookie, csrfToken } = alsOwner(u);

    const text = await (
      await sende(u.basis, cookie, [
        ['_csrf', csrfToken], ['art', 'dm'], ['text', 'x'],
        ['empfaenger', 'mitglied:m1'], ['empfaenger', 'mitglied:m3'],
        ['entfernen', 'mitglied:m1'],
      ])
    ).text();

    assert.ok(!text.includes('value="mitglied:m1"'), 'Der gewählte Chip steht noch da');
    assert.ok(text.includes('value="mitglied:m3"'), 'Der andere Chip wurde mitentfernt');
  });
});

test('Grenze und Pause stehen sichtbar neben der Auswahl', async () => {
  await mitServer(async (u) => {
    const { cookie, csrfToken } = alsOwner(u);

    const text = await (
      await sende(u.basis, cookie, [
        ['_csrf', csrfToken], ['art', 'dm'], ['text', 'x'], ['hinzufuegen', 'rolle:r-alt'],
      ])
    ).text();

    assert.match(text, /2 von 100/, 'Die Anzahl und die Grenze fehlen');
    assert.match(text, /1200\s*(ms|Millisekunden)/i, 'Die Pause fehlt');
  });
});

test('doppelt gewählte Personen zählen einmal', async () => {
  await mitServer(async (u) => {
    const { cookie, csrfToken } = alsOwner(u);

    const text = await (
      await sende(u.basis, cookie, [
        ['_csrf', csrfToken], ['art', 'dm'], ['text', 'x'],
        ['empfaenger', 'rolle:r-neu'], ['empfaenger', 'rolle:r-alt'],
        ['suchen', 'ja'],
      ])
    ).text();

    assert.match(text, /3 von 100/);
  });
});

test('eine leere Rolle wird benannt statt schweigend zu null Empfängern zu führen', async () => {
  await mitApp(
    async (u) => {
      const { cookie, csrfToken } = alsOwner(u);

      const text = await (
        await sende(u.basis, cookie, [
          ['_csrf', csrfToken], ['art', 'dm'], ['text', 'x'], ['hinzufuegen', 'rolle:r-leer'],
        ])
      ).text();

      assert.match(text, /keine Mitglieder|niemand/i);
    },
    { discordServer: { rollen: [{ id: 'r-leer', name: 'Leer', position: 2 }], mitglieder: [] } },
  );
});

test('im Kanal-Modus gibt es keine Empfängersuche', async () => {
  await mitServer(async (u) => {
    const { cookie } = alsOwner(u);

    const text = await (
      await fetch(`${u.basis}/nachricht?art=kanal`, { headers: { cookie } })
    ).text();

    assert.ok(!text.includes('name="empfaengerSuche"'), 'Die Empfängersuche ist sichtbar');
  });
});

test('ohne verbundenen Bot erklärt die Seite, warum die Suche nichts findet', async () => {
  await mitApp(
    async (u) => {
      const { cookie } = alsOwner(u);

      const text = await (
        await fetch(`${u.basis}/nachricht?art=dm`, { headers: { cookie } })
      ).text();

      assert.match(text, /Bot/);
      assert.match(text, /nicht verbunden|keine Verbindung/i);
    },
    { discordServer: SERVER, botVerbunden: false, rollen: { 4242: [] } },
  );
});
