import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mitApp, GILDE } from '../hilfen/app.mjs';
import { RECHT } from '../hilfen/discord-doppel.mjs';
import { regelsatz } from '../../src/web/seiten/rollenregeln.mjs';

/**
 * Rollenregeln.
 *
 * Drei Sperrgründe, und für jeden ein Test — samt der Probe, dass ein
 * untergeschobener Aufruf sie nicht umgeht. `disabled` im Formular ist eine
 * Bequemlichkeit für die Bedienung, keine Sicherung.
 */

const SITZUNG_COOKIE = 'panel_sitzung';

/** Der Bot steht auf Position 10 — alles darüber kann er nicht anfassen. */
const SERVER = {
  gildenName: 'Mein Server',
  botRolleposition: 10,
  rollen: [
    { id: 'r-neu', name: 'Neu', position: 2 },
    { id: 'r-verifiziert', name: 'Verifiziert', position: 3 },
    { id: 'r-chef', name: 'Chef', position: 20 },
    { id: 'r-boost', name: 'Server-Booster', position: 4, managed: true },
  ],
  mitglieder: [{ id: '4242', name: 'Owner', rollen: [] }],
};

function alsOwner({ sitzungen, konfig }) {
  const { kennung, csrfToken } = sitzungen.lege_an(GILDE, {
    discordUserId: konfig.ownerId, anzeigename: 'Owner',
  });
  return { cookie: `${SITZUNG_COOKIE}=${encodeURIComponent(kennung)}`, csrfToken };
}

async function post(basis, cookie, paare) {
  const koerper = new URLSearchParams();
  for (const [name, wert] of paare) koerper.append(name, wert);
  return fetch(`${basis}/rollenregeln`, {
    method: 'POST', redirect: 'manual',
    headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
    body: koerper.toString(),
  });
}

const hole = async (basis, pfad, cookie) =>
  (await fetch(`${basis}${pfad}`, { headers: { cookie } })).text();

const mitServer = (fn, extra = {}) => mitApp(fn, { discordServer: SERVER, ...extra });

test('der Regelsatz sagt in einem Satz, was passiert', () => {
  assert.equal(regelsatz('Verifiziert', ['Neu']), 'Wer „Verifiziert“ erhält, verliert „Neu“.');
  assert.equal(
    regelsatz('Verifiziert', ['Neu', 'Gast']),
    'Wer „Verifiziert“ erhält, verliert „Neu“ und „Gast“.',
  );
  assert.equal(
    regelsatz('Verifiziert', ['Neu', 'Gast', 'Test']),
    'Wer „Verifiziert“ erhält, verliert „Neu“, „Gast“ und „Test“.',
  );
  assert.match(regelsatz('Verifiziert', []), /verliert nichts/);
  assert.match(regelsatz(null, []), /Wähle einen Auslöser/);
});

test('eine Rolle über der Bot-Rolle ist gesperrt und sagt warum', async () => {
  await mitServer(async (u) => {
    const { cookie } = alsOwner(u);
    const text = await hole(u.basis, '/rollenregeln', cookie);

    assert.match(text, /value="r-chef" disabled/);
    assert.match(text, /Chef — Steht über der Rolle des Bots/);
    assert.match(text, /zu hoch/);
  });
});

test('eine von einer Integration verwaltete Rolle ist gesperrt und sagt warum', async () => {
  await mitServer(async (u) => {
    const { cookie } = alsOwner(u);
    const text = await hole(u.basis, '/rollenregeln', cookie);

    assert.match(text, /value="r-boost" disabled/);
    assert.match(text, /Server-Booster — Wird von einer Integration verwaltet/);
    assert.match(text, /verwaltet/);
  });
});

test('die Auslöserrolle selbst ist als Entzug gesperrt', async () => {
  await mitServer(async (u) => {
    const { cookie } = alsOwner(u);
    const text = await hole(u.basis, '/rollenregeln?ausloeser=r-verifiziert', cookie);

    assert.match(text, /value="r-verifiziert" checked disabled|value="r-verifiziert" disabled/);
    assert.match(text, /Verifiziert — Das ist die Auslöserrolle selbst\./);
  });
});

test('ohne Recht, Rollen zu verwalten, ist alles gesperrt und der Grund steht da', async () => {
  await mitServer(
    async (u) => {
      const { cookie } = alsOwner(u);
      const text = await hole(u.basis, '/rollenregeln', cookie);

      assert.match(text, /Dem Bot fehlt das Recht, Rollen zu verwalten\./);
      assert.match(text, /kein Recht/);
    },
    { discordServer: { ...SERVER, botRechte: [RECHT.KANAL_SEHEN, RECHT.NACHRICHTEN_SENDEN] } },
  );
});

test('eine gültige Regel lässt sich speichern und steht danach im Klartext da', async () => {
  await mitServer(async (u) => {
    const { cookie, csrfToken } = alsOwner(u);

    const antwort = await post(u.basis, cookie, [
      ['_csrf', csrfToken], ['ausloeser', 'r-verifiziert'], ['entzug', 'r-neu'],
      ['aktiv', 'nein'], ['aktiv', 'ja'], ['notiz', 'Stufe eins ablösen'], ['sichern', 'ja'],
    ]);
    const text = await antwort.text();

    assert.equal(antwort.status, 200);
    assert.match(text, /Wer „Verifiziert“ erhält, verliert „Neu“\./);

    const [regel] = u.rollenregeln.alle(GILDE);
    assert.equal(regel.ausloeser, 'r-verifiziert');
    assert.deepEqual(regel.entzug, ['r-neu']);
    assert.equal(regel.aktiv, true);
    assert.equal(regel.notiz, 'Stufe eins ablösen');
  });
});

test('ein untergeschobener Entzug einer gesperrten Rolle wird abgelehnt', async () => {
  // `disabled` im Formular ist Bequemlichkeit, keine Sicherung.
  await mitServer(async (u) => {
    const { cookie, csrfToken } = alsOwner(u);

    const antwort = await post(u.basis, cookie, [
      ['_csrf', csrfToken], ['ausloeser', 'r-verifiziert'], ['entzug', 'r-chef'],
      ['aktiv', 'nein'], ['sichern', 'ja'],
    ]);
    const text = await antwort.text();

    assert.equal(antwort.status, 422);
    assert.match(text, /„Chef“ lässt sich nicht entziehen: Steht über der Rolle des Bots/);
    assert.equal(u.rollenregeln.alle(GILDE).length, 0);
  });
});

test('ein untergeschobener Entzug der Auslöserrolle wird abgelehnt', async () => {
  await mitServer(async (u) => {
    const { cookie, csrfToken } = alsOwner(u);

    const antwort = await post(u.basis, cookie, [
      ['_csrf', csrfToken], ['ausloeser', 'r-verifiziert'], ['entzug', 'r-verifiziert'],
      ['aktiv', 'nein'], ['sichern', 'ja'],
    ]);

    assert.equal(antwort.status, 422);
    assert.match(await antwort.text(), /Das ist die Auslöserrolle selbst/);
    assert.equal(u.rollenregeln.alle(GILDE).length, 0);
  });
});

test('eine erfundene Auslöserrolle wird abgelehnt', async () => {
  await mitServer(async (u) => {
    const { cookie, csrfToken } = alsOwner(u);

    const antwort = await post(u.basis, cookie, [
      ['_csrf', csrfToken], ['ausloeser', 'r-erfunden'], ['entzug', 'r-neu'],
      ['aktiv', 'nein'], ['sichern', 'ja'],
    ]);

    assert.equal(antwort.status, 422);
    assert.match(await antwort.text(), /Wähle eine Auslöserrolle, die es auf dem Server gibt/);
    assert.equal(u.rollenregeln.alle(GILDE).length, 0);
  });
});

test('eine aktive Regel, die nichts entzieht, wird abgelehnt', async () => {
  await mitServer(async (u) => {
    const { cookie, csrfToken } = alsOwner(u);

    const antwort = await post(u.basis, cookie, [
      ['_csrf', csrfToken], ['ausloeser', 'r-verifiziert'],
      ['aktiv', 'nein'], ['aktiv', 'ja'], ['sichern', 'ja'],
    ]);

    assert.equal(antwort.status, 422);
    assert.match(await antwort.text(), /täte nichts/);
  });
});

test('zweimal Speichern ersetzt die Regel, statt eine zweite anzulegen', async () => {
  await mitServer(async (u) => {
    const { cookie, csrfToken } = alsOwner(u);

    await post(u.basis, cookie, [
      ['_csrf', csrfToken], ['ausloeser', 'r-verifiziert'], ['entzug', 'r-neu'],
      ['aktiv', 'nein'], ['sichern', 'ja'],
    ]);
    // Zweites Mal gültig, mit anderem Entzug.
    await post(u.basis, cookie, [
      ['_csrf', csrfToken], ['ausloeser', 'r-verifiziert'],
      // Zweimal dieselbe Rolle: Beim Speichern soll sie einmal ankommen.
      ['entzug', 'r-neu'], ['entzug', 'r-neu'],
      ['aktiv', 'nein'], ['aktiv', 'ja'], ['notiz', 'Jetzt aktiv'], ['sichern', 'ja'],
    ]);

    const alle = u.rollenregeln.alle(GILDE);
    assert.equal(alle.length, 1, 'Es ist eine zweite Regel für denselben Auslöser entstanden');
    // Doppelte Einträge werden beim Speichern zusammengefasst.
    assert.deepEqual(alle[0].entzug, ['r-neu']);
    assert.equal(alle[0].aktiv, true);
    assert.equal(alle[0].notiz, 'Jetzt aktiv');
  });
});

test('eine bestehende Regel lässt sich bearbeiten und löschen', async () => {
  await mitServer(async (u) => {
    const { cookie, csrfToken } = alsOwner(u);
    u.rollenregeln.sichere(GILDE, 'r-verifiziert', {
      entzug: ['r-neu'], aktiv: true, notiz: 'Alte Notiz',
    });

    const bearbeiten = await hole(u.basis, '/rollenregeln?ausloeser=r-verifiziert', cookie);
    assert.match(bearbeiten, /value="r-verifiziert" checked/);
    assert.match(bearbeiten, /Alte Notiz/);
    assert.match(bearbeiten, /Regel bearbeiten/);

    const geloescht = await post(u.basis, cookie, [
      ['_csrf', csrfToken], ['ausloeser', 'r-verifiziert'], ['loeschen', 'ja'],
    ]);
    assert.match(await geloescht.text(), /Regel gelöscht/);
    assert.equal(u.rollenregeln.alle(GILDE).length, 0);
  });
});

test('„Auswahl übernehmen“ zeigt den Satz neu, ohne zu speichern', async () => {
  await mitServer(async (u) => {
    const { cookie, csrfToken } = alsOwner(u);

    const text = await (
      await post(u.basis, cookie, [
        ['_csrf', csrfToken], ['ausloeser', 'r-verifiziert'], ['entzug', 'r-neu'],
        ['aktiv', 'nein'], ['uebernehmen', 'ja'],
      ])
    ).text();

    assert.match(text, /Wer „Verifiziert“ erhält, verliert „Neu“\./);
    assert.equal(u.rollenregeln.alle(GILDE).length, 0, 'Übernehmen hat gespeichert');
  });
});

test('eine Regel mit verschwundener Auslöserrolle wird benannt', async () => {
  await mitServer(async (u) => {
    const { cookie } = alsOwner(u);
    u.rollenregeln.sichere(GILDE, 'r-weg', { entzug: ['r-neu'], aktiv: true });

    const text = await hole(u.basis, '/rollenregeln', cookie);
    assert.match(text, /Die Auslöserrolle gibt es nicht mehr/);
  });
});

test('ein Betrachter kommt nicht an die Rollenregeln', async () => {
  await mitApp(
    async (u) => {
      const { kennung } = u.sitzungen.lege_an(GILDE, { discordUserId: 'm1', anzeigename: 'Anna' });
      const antwort = await fetch(`${u.basis}/rollenregeln`, {
        headers: { cookie: `${SITZUNG_COOKIE}=${encodeURIComponent(kennung)}` },
      });
      assert.equal(antwort.status, 403);
    },
    { discordServer: SERVER, rollen: { m1: ['r-schau'] }, zugriffsregeln: [['r-schau', 'BETRACHTER']] },
  );
});
