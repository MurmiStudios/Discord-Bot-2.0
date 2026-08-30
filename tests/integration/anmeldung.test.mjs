import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mitApp, cookieAus, cookieZusaetze, GILDE } from '../hilfen/app.mjs';

const STATE_COOKIE = 'panel_state';
const SITZUNG_COOKIE = 'panel_sitzung';

/** Folgt dem Anmeldeablauf bis zum gesetzten Sitzungs-Cookie. */
async function meldeAn(basis, { code = 'gueltiger-code' } = {}) {
  const start = await fetch(`${basis}/auth/start`, { redirect: 'manual' });
  const state = cookieAus(start, STATE_COOKIE);
  const antwort = await fetch(
    `${basis}/auth/callback?code=${code}&state=${encodeURIComponent(state)}`,
    { redirect: 'manual', headers: { cookie: `${STATE_COOKIE}=${encodeURIComponent(state)}` } },
  );
  return { antwort, state, sitzung: cookieAus(antwort, SITZUNG_COOKIE) };
}

test('wer nicht angemeldet ist, landet auf der Anmeldeseite', async () => {
  await mitApp(async ({ basis }) => {
    const antwort = await fetch(`${basis}/`, { redirect: 'manual' });

    assert.equal(antwort.status, 302);
    assert.equal(antwort.headers.get('location'), '/login');
  });
});

test('die Anmeldeseite bietet den Weg zu Discord an und nennt kein Passwortfeld', async () => {
  await mitApp(async ({ basis }) => {
    const antwort = await fetch(`${basis}/login`);
    const text = await antwort.text();

    assert.equal(antwort.status, 200);
    assert.match(text, /\/auth\/start/);
    assert.ok(!/type="password"/.test(text), 'Es gibt ein Passwortfeld');
  });
});

test('der Start leitet zu Discord, mit Client-ID, Rueckkehradresse und Zufallswert', async () => {
  await mitApp(async ({ basis, konfig }) => {
    const antwort = await fetch(`${basis}/auth/start`, { redirect: 'manual' });
    const ziel = new URL(antwort.headers.get('location'));

    assert.equal(antwort.status, 302);
    assert.equal(ziel.host, 'discord.com');
    assert.equal(ziel.searchParams.get('client_id'), konfig.clientId);
    assert.equal(ziel.searchParams.get('redirect_uri'), konfig.redirectUri);
    assert.equal(ziel.searchParams.get('response_type'), 'code');
    assert.ok((ziel.searchParams.get('state') ?? '').length >= 16);
  });
});

test('der Start verlangt nur identify — keine Rechte, die er nicht braucht', async () => {
  await mitApp(async ({ basis }) => {
    const antwort = await fetch(`${basis}/auth/start`, { redirect: 'manual' });
    const scopes = new URL(antwort.headers.get('location')).searchParams.get('scope');

    assert.equal(scopes, 'identify');
  });
});

test('der Zufallswert wird als kurzlebiges, nicht auslesbares Cookie hinterlegt', async () => {
  await mitApp(async ({ basis }) => {
    const antwort = await fetch(`${basis}/auth/start`, { redirect: 'manual' });
    const zusaetze = cookieZusaetze(antwort, STATE_COOKIE);

    assert.ok(zusaetze, 'Kein state-Cookie gesetzt');
    assert.match(zusaetze, /HttpOnly/i);
    assert.match(zusaetze, /SameSite=Lax/i);
  });
});

test('ein vollstaendiger Ablauf meldet an und setzt das Sitzungs-Cookie', async () => {
  await mitApp(async ({ basis }) => {
    const { antwort, sitzung } = await meldeAn(basis);

    assert.equal(antwort.status, 302);
    assert.equal(antwort.headers.get('location'), '/');
    assert.ok(sitzung, 'Kein Sitzungs-Cookie gesetzt');
  });
});

test('nach der Anmeldung ist die Startseite erreichbar', async () => {
  await mitApp(async ({ basis }) => {
    const { sitzung } = await meldeAn(basis);

    const antwort = await fetch(`${basis}/`, {
      redirect: 'manual',
      headers: { cookie: `${SITZUNG_COOKIE}=${encodeURIComponent(sitzung)}` },
    });

    assert.equal(antwort.status, 200);
  });
});

test('ein falscher Zufallswert fuehrt zur Fehlerseite, nicht zur Anmeldung', async () => {
  await mitApp(async ({ basis }) => {
    const start = await fetch(`${basis}/auth/start`, { redirect: 'manual' });
    const state = cookieAus(start, STATE_COOKIE);

    const antwort = await fetch(`${basis}/auth/callback?code=gueltiger-code&state=fremder-wert`, {
      redirect: 'manual',
      headers: { cookie: `${STATE_COOKIE}=${encodeURIComponent(state)}` },
    });

    assert.equal(antwort.status, 403);
    assert.equal(cookieAus(antwort, SITZUNG_COOKIE), undefined, 'Es wurde trotzdem angemeldet');
  });
});

test('ein fehlender Zufallswert fuehrt zur Fehlerseite', async () => {
  await mitApp(async ({ basis }) => {
    const antwort = await fetch(`${basis}/auth/callback?code=gueltiger-code`, {
      redirect: 'manual',
    });

    assert.equal(antwort.status, 403);
    assert.equal(cookieAus(antwort, SITZUNG_COOKIE), undefined);
  });
});

test('ohne Zufallswert im Cookie hilft auch der richtige Wert in der Adresse nicht', async () => {
  await mitApp(async ({ basis }) => {
    const start = await fetch(`${basis}/auth/start`, { redirect: 'manual' });
    const state = cookieAus(start, STATE_COOKIE);

    const antwort = await fetch(
      `${basis}/auth/callback?code=gueltiger-code&state=${encodeURIComponent(state)}`,
      { redirect: 'manual' },
    );

    assert.equal(antwort.status, 403);
  });
});

test('ein von Discord abgelehnter Code meldet niemanden an', async () => {
  await mitApp(async ({ basis }) => {
    const { antwort, sitzung } = await meldeAn(basis, { code: 'falscher-code' });

    assert.equal(antwort.status, 502);
    assert.equal(sitzung, undefined);
  });
});

test('bricht Discord den Ablauf ab, wird das als Meldung gezeigt statt als Absturz', async () => {
  await mitApp(async ({ basis }) => {
    const antwort = await fetch(`${basis}/auth/callback?error=access_denied`, {
      redirect: 'manual',
    });

    assert.equal(antwort.status, 400);
    assert.match(await antwort.text(), /abgebrochen/i);
  });
});

test('die Anmeldung vergibt eine neue Kennung — eine untergeschobene gilt nicht weiter', async () => {
  await mitApp(async ({ basis, sitzungen }) => {
    const vorher = sitzungen.lege_an(GILDE, { discordUserId: '9999', anzeigename: 'Fremd' });

    const start = await fetch(`${basis}/auth/start`, { redirect: 'manual' });
    const state = cookieAus(start, STATE_COOKIE);
    const antwort = await fetch(
      `${basis}/auth/callback?code=gueltiger-code&state=${encodeURIComponent(state)}`,
      {
        redirect: 'manual',
        headers: {
          cookie: `${STATE_COOKIE}=${encodeURIComponent(state)}; ${SITZUNG_COOKIE}=${encodeURIComponent(vorher.kennung)}`,
        },
      },
    );

    const neu = cookieAus(antwort, SITZUNG_COOKIE);
    assert.notEqual(neu, vorher.kennung, 'Die untergeschobene Kennung wurde weiterbenutzt');
    assert.equal(sitzungen.lies(vorher.kennung), undefined, 'Die alte Sitzung lebt weiter');
  });
});

test('der Zufallswert gilt nur einmal — der Rueckweg loescht ihn', async () => {
  await mitApp(async ({ basis }) => {
    const { antwort } = await meldeAn(basis);
    const zusaetze = cookieZusaetze(antwort, STATE_COOKIE);

    assert.ok(zusaetze, 'Das state-Cookie wurde nicht geloescht');
    assert.match(zusaetze, /Expires=Thu, 01 Jan 1970|Max-Age=0/i);
  });
});

test('Abmelden loescht die Sitzung serverseitig, nicht nur das Cookie', async () => {
  await mitApp(async ({ basis, sitzungen }) => {
    const { sitzung } = await meldeAn(basis);

    const antwort = await fetch(`${basis}/logout`, {
      method: 'POST',
      redirect: 'manual',
      headers: { cookie: `${SITZUNG_COOKIE}=${encodeURIComponent(sitzung)}` },
    });

    assert.equal(antwort.status, 302);
    assert.equal(sitzungen.lies(sitzung), undefined, 'Die Sitzung lebt nach dem Abmelden weiter');
  });
});

test('das Discord-Token taucht nirgends im Protokoll auf', async () => {
  await mitApp(async ({ basis, logzeilen, konfig }) => {
    await meldeAn(basis);

    const alles = logzeilen.join('\n');
    assert.ok(!alles.includes(konfig.clientSecret), 'Das Client-Secret steht im Log');
    assert.ok(!alles.includes('zugriffs-token'), 'Das Zugriffstoken steht im Log');
  });
});
