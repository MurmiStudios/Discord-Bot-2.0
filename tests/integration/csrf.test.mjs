import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mitApp, GILDE } from '../hilfen/app.mjs';

const SITZUNG_COOKIE = 'panel_sitzung';

/** Angemeldete Sitzung als Owner, samt Cookie-Kopf und CSRF-Token. */
function alsOwner({ sitzungen, konfig }) {
  const { kennung, csrfToken } = sitzungen.lege_an(GILDE, {
    discordUserId: konfig.ownerId,
    anzeigename: 'Owner',
  });
  return { cookie: `${SITZUNG_COOKIE}=${encodeURIComponent(kennung)}`, csrfToken, kennung };
}

function formular(felder) {
  return {
    method: 'POST',
    redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(felder).toString(),
  };
}

test('ein schreibender Aufruf ohne Token wird abgewiesen', async () => {
  await mitApp(async (umgebung) => {
    const { cookie, kennung } = alsOwner(umgebung);

    const antwort = await fetch(`${umgebung.basis}/logout`, {
      ...formular({}),
      headers: { 'content-type': 'application/x-www-form-urlencoded', cookie },
    });

    assert.equal(antwort.status, 403);
    assert.ok(umgebung.sitzungen.lies(kennung), 'Die Abmeldung wurde trotzdem ausgeführt');
  });
});

test('ein fremdes Token wird abgewiesen und wirkt nicht', async () => {
  await mitApp(async (umgebung) => {
    const { cookie, kennung } = alsOwner(umgebung);
    const fremd = umgebung.sitzungen.lege_an(GILDE, { discordUserId: '9999' }).csrfToken;

    const antwort = await fetch(`${umgebung.basis}/logout`, {
      ...formular({ _csrf: fremd }),
      headers: { 'content-type': 'application/x-www-form-urlencoded', cookie },
    });

    assert.equal(antwort.status, 403);
    assert.ok(umgebung.sitzungen.lies(kennung), 'Die Abmeldung wurde trotzdem ausgeführt');
  });
});

test('ein Token der falschen Länge wird abgewiesen, nicht verglichen', async () => {
  await mitApp(async (umgebung) => {
    const { cookie, kennung } = alsOwner(umgebung);

    const antwort = await fetch(`${umgebung.basis}/logout`, {
      ...formular({ _csrf: 'kurz' }),
      headers: { 'content-type': 'application/x-www-form-urlencoded', cookie },
    });

    assert.equal(antwort.status, 403);
    assert.ok(umgebung.sitzungen.lies(kennung));
  });
});

test('mit dem richtigen Token geht der Aufruf durch', async () => {
  await mitApp(async (umgebung) => {
    const { cookie, csrfToken, kennung } = alsOwner(umgebung);

    const antwort = await fetch(`${umgebung.basis}/logout`, {
      ...formular({ _csrf: csrfToken }),
      headers: { 'content-type': 'application/x-www-form-urlencoded', cookie },
    });

    assert.equal(antwort.status, 302);
    assert.equal(umgebung.sitzungen.lies(kennung), undefined, 'Die Abmeldung blieb aus');
  });
});

test('lesende Aufrufe brauchen kein Token', async () => {
  await mitApp(async (umgebung) => {
    const { cookie } = alsOwner(umgebung);

    const antwort = await fetch(`${umgebung.basis}/`, { redirect: 'manual', headers: { cookie } });

    assert.equal(antwort.status, 200);
  });
});

test('jedes schreibende Formular bringt das Token schon mit', async () => {
  await mitApp(async (umgebung) => {
    const { cookie, csrfToken } = alsOwner(umgebung);

    const text = await (
      await fetch(`${umgebung.basis}/`, { redirect: 'manual', headers: { cookie } })
    ).text();

    assert.match(text, /name="_csrf"/);
    assert.ok(text.includes(csrfToken), 'Das Formular trägt nicht das Token dieser Sitzung');
  });
});

test('die Abweisung erklärt, was zu tun ist, statt nur zu blocken', async () => {
  await mitApp(async (umgebung) => {
    const { cookie } = alsOwner(umgebung);

    const text = await (
      await fetch(`${umgebung.basis}/logout`, {
        ...formular({}),
        headers: { 'content-type': 'application/x-www-form-urlencoded', cookie },
      })
    ).text();

    assert.match(text, /neu geladen|noch einmal/i);
  });
});
