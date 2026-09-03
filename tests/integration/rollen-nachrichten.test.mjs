import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mitApp, GILDE } from '../hilfen/app.mjs';

/**
 * Nachrichten, die am Erhalt einer Rolle hängen.
 *
 * Die wichtigste Zusicherung steht im Schema und wird hier geprüft: genau eine
 * Nachricht je Rolle. Ein zweites Speichern ersetzt, es legt nichts an.
 */

const SITZUNG_COOKIE = 'panel_sitzung';

const SERVER = {
  gildenName: 'Mein Server',
  rollen: [
    { id: 'r-neu', name: 'Neu', position: 2 },
    { id: 'r-verifiziert', name: 'Verifiziert', position: 3 },
    { id: 'r-team', name: 'Team', position: 4 },
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
  return fetch(`${basis}/rollen-nachrichten`, {
    method: 'POST', redirect: 'manual',
    headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
    body: koerper.toString(),
  });
}

const holeAntwort = (basis, pfad, cookie) => fetch(`${basis}${pfad}`, { headers: { cookie } });
const hole = async (basis, pfad, cookie) => (await holeAntwort(basis, pfad, cookie)).text();

const mitServer = (fn) => mitApp(fn, { discordServer: SERVER });

test('ohne gewählte Rolle steht die Auswahl da, kein Editor', async () => {
  await mitServer(async (u) => {
    const { cookie } = alsOwner(u);
    const text = await hole(u.basis, '/rollen-nachrichten', cookie);

    assert.match(text, /Wähle oben eine Rolle/);
    assert.match(text, /href="\/rollen-nachrichten\?rolle=r-neu"/);
    assert.match(text, /href="\/rollen-nachrichten\?rolle=r-team"/);
    assert.doesNotMatch(text, /name="rollenId"/);
  });
});

test('eine gewählte Rolle öffnet ihren eigenen Editor', async () => {
  await mitServer(async (u) => {
    const { cookie } = alsOwner(u);
    const text = await hole(u.basis, '/rollen-nachrichten?rolle=r-verifiziert', cookie);

    assert.match(text, /Nachricht für „Verifiziert“/);
    assert.match(text, /<input type="hidden" name="rollenId" value="r-verifiziert">/);
    assert.match(text, /aria-current="true"/);
    assert.match(text, /data-platzhalter-ziel="text"/);
  });
});

test('zweimal Speichern ersetzt, statt eine zweite Nachricht anzulegen', async () => {
  await mitServer(async (u) => {
    const { cookie, csrfToken } = alsOwner(u);

    await post(u.basis, cookie, [
      ['_csrf', csrfToken], ['rollenId', 'r-neu'], ['aktiv', 'nein'],
      ['text', 'Erste Fassung'], ['sichern', 'ja'],
    ]);
    await post(u.basis, cookie, [
      ['_csrf', csrfToken], ['rollenId', 'r-neu'], ['aktiv', 'nein'], ['aktiv', 'ja'],
      ['text', 'Zweite Fassung'], ['sichern', 'ja'],
    ]);

    const alle = u.rollenNachrichten.alle(GILDE);
    assert.equal(alle.length, 1, 'Es ist eine zweite Nachricht für dieselbe Rolle entstanden');
    assert.equal(alle[0].daten.text, 'Zweite Fassung');
    assert.equal(alle[0].aktiv, true);
  });
});

test('jede Rolle behält ihre eigene Nachricht', async () => {
  await mitServer(async (u) => {
    const { cookie, csrfToken } = alsOwner(u);

    await post(u.basis, cookie, [
      ['_csrf', csrfToken], ['rollenId', 'r-neu'], ['aktiv', 'nein'],
      ['text', 'Für die Neuen'], ['sichern', 'ja'],
    ]);
    await post(u.basis, cookie, [
      ['_csrf', csrfToken], ['rollenId', 'r-team'], ['aktiv', 'nein'],
      ['text', 'Fürs Team'], ['sichern', 'ja'],
    ]);

    assert.equal(u.rollenNachrichten.alle(GILDE).length, 2);
    assert.match(await hole(u.basis, '/rollen-nachrichten?rolle=r-neu', cookie), /Für die Neuen/);
    assert.match(await hole(u.basis, '/rollen-nachrichten?rolle=r-team', cookie), /Fürs Team/);
  });
});

test('der Punkt an der Pille zeigt den Zustand', async () => {
  await mitServer(async (u) => {
    const { cookie, csrfToken } = alsOwner(u);

    await post(u.basis, cookie, [
      ['_csrf', csrfToken], ['rollenId', 'r-neu'], ['aktiv', 'nein'], ['aktiv', 'ja'],
      ['text', 'Aktiv'], ['sichern', 'ja'],
    ]);
    await post(u.basis, cookie, [
      ['_csrf', csrfToken], ['rollenId', 'r-team'], ['aktiv', 'nein'],
      ['text', 'Ruht'], ['sichern', 'ja'],
    ]);

    const text = await hole(u.basis, '/rollen-nachrichten', cookie);

    assert.match(text, /Neu — Aktiv[^"]*"[\s\S]{0,120}rollenpunkt-aktiv/);
    assert.match(text, /rollenpunkt-ruht/);
    assert.match(text, /rollenpunkt-leer/, 'Verifiziert hat nichts und müsste leer sein');
    // Auch ohne Punkt lesbar: der Zustand steht als Text daneben.
    assert.match(text, /Aktiv — der Rollenerhalt löst sie aus/);
    assert.match(text, /Hinterlegt, aber ausgeschaltet/);
  });
});

test('aktiv ohne Inhalt wird abgelehnt und nennt die Rolle', async () => {
  await mitServer(async (u) => {
    const { cookie, csrfToken } = alsOwner(u);

    const antwort = await post(u.basis, cookie, [
      ['_csrf', csrfToken], ['rollenId', 'r-neu'], ['aktiv', 'nein'], ['aktiv', 'ja'],
      ['text', '  '], ['sichern', 'ja'],
    ]);

    assert.equal(antwort.status, 422);
    assert.match(await antwort.text(), /dann bleibt für „Neu“ alles stehen/);
    assert.equal(u.rollenNachrichten.alle(GILDE).length, 0);
  });
});

test('Ausschalten löscht die Nachricht nicht', async () => {
  await mitServer(async (u) => {
    const { cookie, csrfToken } = alsOwner(u);

    await post(u.basis, cookie, [
      ['_csrf', csrfToken], ['rollenId', 'r-neu'], ['aktiv', 'nein'], ['aktiv', 'ja'],
      ['text', 'Bleibt stehen'], ['sichern', 'ja'],
    ]);
    await post(u.basis, cookie, [
      ['_csrf', csrfToken], ['rollenId', 'r-neu'], ['aktiv', 'nein'],
      ['text', 'Bleibt stehen'], ['sichern', 'ja'],
    ]);

    const eintrag = u.rollenNachrichten.fuerRolle(GILDE, 'r-neu');
    assert.equal(eintrag.aktiv, false);
    assert.equal(eintrag.daten.text, 'Bleibt stehen');
  });
});

test('eine Rolle, die es nicht gibt, führt zur Auswahl statt in einen Editor', async () => {
  await mitServer(async (u) => {
    const { cookie } = alsOwner(u);
    const antwort = await holeAntwort(u.basis, '/rollen-nachrichten?rolle=gibt-es-nicht', cookie);

    assert.equal(antwort.status, 200);
    assert.match(await antwort.text(), /Wähle oben eine Rolle/);
  });
});

test('ein untergeschobenes Speichern auf eine erfundene Rolle wird abgelehnt', async () => {
  await mitServer(async (u) => {
    const { cookie, csrfToken } = alsOwner(u);

    const antwort = await post(u.basis, cookie, [
      ['_csrf', csrfToken], ['rollenId', 'r-erfunden'], ['aktiv', 'nein'],
      ['text', 'Hallo'], ['sichern', 'ja'],
    ]);

    assert.equal(antwort.status, 404);
    assert.equal(u.rollenNachrichten.alle(GILDE).length, 0);
  });
});

test('die Zwischenschritte funktionieren auch hier ohne JavaScript', async () => {
  await mitServer(async (u) => {
    const { cookie, csrfToken } = alsOwner(u);

    const text = await (
      await post(u.basis, cookie, [
        ['_csrf', csrfToken], ['rollenId', 'r-neu'], ['aktiv', 'nein'],
        ['text', 'Hallo '], ['platzhalterEinfuegen', 'text|{role}'],
      ])
    ).text();

    assert.match(text, /Hallo \{role\}/);
    assert.equal(u.rollenNachrichten.alle(GILDE).length, 0, 'Ein Zwischenschritt hat gespeichert');
  });
});

test('die Seite sagt, wofür {role} hier steht', async () => {
  await mitServer(async (u) => {
    const { cookie } = alsOwner(u);
    const text = await hole(u.basis, '/rollen-nachrichten?rolle=r-team', cookie);

    assert.match(text, /<code>\{role\}<\/code> steht hier für „Team“/);
  });
});

test('ein Betrachter kommt nicht an die Rollen-Nachrichten', async () => {
  await mitApp(
    async (u) => {
      const { kennung } = u.sitzungen.lege_an(GILDE, { discordUserId: 'm1', anzeigename: 'Anna' });
      const antwort = await fetch(`${u.basis}/rollen-nachrichten`, {
        headers: { cookie: `${SITZUNG_COOKIE}=${encodeURIComponent(kennung)}` },
      });
      assert.equal(antwort.status, 403);
    },
    { discordServer: SERVER, rollen: { m1: ['r-schau'] }, zugriffsregeln: [['r-schau', 'BETRACHTER']] },
  );
});

// ── „Jetzt an alle“ ──────────────────────────────────────────────────

test('„Jetzt an alle“ fragt zurück, bevor etwas rausgeht', async () => {
  await mitApp(
    async (u) => {
      const { cookie, csrfToken } = alsOwner(u);

      const antwort = await post(u.basis, cookie, [
        ['_csrf', csrfToken], ['rollenId', 'r-neu'], ['aktiv', 'nein'], ['aktiv', 'ja'],
        ['text', 'Du hast jetzt {role}!'], ['anAlle', 'ja'],
      ]);
      const text = await antwort.text();

      assert.equal(antwort.status, 200);
      assert.match(text, /Wirklich senden\?/);
      assert.match(text, /<strong>2 Empfänger<\/strong>/);
      assert.match(text, /hinterlegte Rollen-Nachricht/);
      assert.equal(u.doppelServer.gesendet.length, 0, 'Es ging ohne Rückfrage etwas raus');

      // Und gespeichert wurde vorher — sonst ginge eine andere Fassung raus.
      assert.equal(u.rollenNachrichten.fuerRolle(GILDE, 'r-neu').daten.text, 'Du hast jetzt {role}!');
    },
    {
      discordServer: {
        ...SERVER,
        mitglieder: [
          { id: '4242', name: 'Owner', rollen: [] },
          { id: 'm1', name: 'Anna', rollen: ['r-neu'] },
          { id: 'm2', name: 'Bert', rollen: ['r-neu'] },
        ],
      },
    },
  );
});

test('nach der Bestätigung geht sie an alle mit dieser Rolle, mit {role}', async () => {
  await mitApp(
    async (u) => {
      const { cookie, csrfToken } = alsOwner(u);

      const koerper = new URLSearchParams();
      for (const [n, v] of [
        ['_csrf', csrfToken], ['art', 'dm'], ['text', 'Du hast jetzt {role}!'],
        ['empfaenger', 'rolle:r-neu'], ['rollenKontext', 'r-neu'], ['bestaetigt', 'ja'],
      ]) koerper.append(n, v);

      await fetch(`${u.basis}/versand/starten`, {
        method: 'POST', redirect: 'manual',
        headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
        body: koerper.toString(),
      });
      await u.warteAufVersand();

      assert.equal(u.doppelServer.gesendet.length, 2);
      for (const gesendet of u.doppelServer.gesendet) {
        assert.equal(gesendet.nutzlast.content, 'Du hast jetzt Neu!');
      }
    },
    {
      discordServer: {
        ...SERVER,
        mitglieder: [
          { id: '4242', name: 'Owner', rollen: [] },
          { id: 'm1', name: 'Anna', rollen: ['r-neu'] },
          { id: 'm2', name: 'Bert', rollen: ['r-neu'] },
        ],
      },
    },
  );
});

test('„Jetzt an alle“ bei einer leeren Rolle sagt es, statt nichts zu tun', async () => {
  await mitServer(async (u) => {
    const { cookie, csrfToken } = alsOwner(u);

    const antwort = await post(u.basis, cookie, [
      ['_csrf', csrfToken], ['rollenId', 'r-neu'], ['aktiv', 'nein'],
      ['text', 'Hallo'], ['anAlle', 'ja'],
    ]);

    assert.equal(antwort.status, 422);
    assert.match(await antwort.text(), /„Neu“ hat niemanden/);
    assert.equal(u.doppelServer.gesendet.length, 0);
  });
});
