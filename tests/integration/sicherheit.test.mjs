import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mitApp } from '../hilfen/app.mjs';

test('die Content-Security-Policy ist vollständig ausgeschrieben, nicht geerbt', async () => {
  await mitApp(async ({ basis }) => {
    const csp = (await fetch(`${basis}/login`)).headers.get('content-security-policy');

    assert.ok(csp, 'Es gibt keine CSP');
    for (const richtlinie of ['default-src', 'script-src', 'style-src', 'img-src', 'form-action']) {
      assert.match(csp, new RegExp(richtlinie), `${richtlinie} fehlt`);
    }
  });
});

test('die CSP erlaubt keinen Inline-Code', async () => {
  await mitApp(async ({ basis }) => {
    const csp = (await fetch(`${basis}/login`)).headers.get('content-security-policy');

    assert.ok(!csp.includes("'unsafe-inline'"), "Die CSP erlaubt 'unsafe-inline'");
    assert.ok(!csp.includes("'unsafe-eval'"), "Die CSP erlaubt 'unsafe-eval'");
  });
});

test('das Panel lässt sich nicht in einen fremden Rahmen einbetten', async () => {
  await mitApp(async ({ basis }) => {
    const koepfe = (await fetch(`${basis}/login`)).headers;

    assert.match(koepfe.get('content-security-policy'), /frame-ancestors 'none'/);
    assert.equal(koepfe.get('x-frame-options'), 'DENY');
  });
});

test('der Browser rät den Inhaltstyp nicht und gibt die Adresse nicht weiter', async () => {
  await mitApp(async ({ basis }) => {
    const koepfe = (await fetch(`${basis}/login`)).headers;

    assert.equal(koepfe.get('x-content-type-options'), 'nosniff');
    assert.ok(koepfe.get('referrer-policy'));
  });
});

test('über HTTP gibt es kein HSTS — das würde die eigene Seite unerreichbar machen', async () => {
  await mitApp(async ({ basis }) => {
    const koepfe = (await fetch(`${basis}/login`)).headers;

    assert.equal(koepfe.get('strict-transport-security'), null);
  });
});

test('über HTTPS wird HSTS gesetzt', async () => {
  await mitApp(
    async ({ basis }) => {
      const hsts = (await fetch(`${basis}/login`)).headers.get('strict-transport-security');

      assert.ok(hsts, 'Kein HSTS trotz HTTPS');
      assert.match(hsts, /max-age=\d+/);
    },
    { konfig: { sicheresCookie: true, vertraueProxy: true, panelUrl: 'https://panel.example.org' } },
  );
});

test('die Sicherheitsköpfe stehen auch auf einer Fehlerseite', async () => {
  await mitApp(async ({ basis }) => {
    const koepfe = (await fetch(`${basis}/gibt-es-nicht`)).headers;

    assert.equal(koepfe.get('x-content-type-options'), 'nosniff');
    assert.ok(koepfe.get('content-security-policy'));
  });
});

test('zwanzig Anmeldeversuche sind erlaubt, der einundzwanzigste nicht mehr', async () => {
  await mitApp(async ({ basis }) => {
    for (let i = 0; i < 20; i += 1) {
      const antwort = await fetch(`${basis}/auth/start`, { redirect: 'manual' });
      assert.equal(antwort.status, 302, `Versuch ${i + 1} wurde schon abgewiesen`);
    }

    const zuviel = await fetch(`${basis}/auth/start`, { redirect: 'manual' });
    assert.equal(zuviel.status, 429);
  });
});

test('die Abweisung wegen zu vieler Versuche ist lesbar und nennt keine Zahlencodes', async () => {
  await mitApp(async ({ basis }) => {
    for (let i = 0; i < 21; i += 1) await fetch(`${basis}/auth/start`, { redirect: 'manual' });

    const text = await (await fetch(`${basis}/auth/start`, { redirect: 'manual' })).text();

    assert.match(text, /zu viele|später/i);
  });
});

test('die Anmeldegrenze bremst nicht das übrige Panel aus', async () => {
  await mitApp(async ({ basis }) => {
    for (let i = 0; i < 21; i += 1) await fetch(`${basis}/auth/start`, { redirect: 'manual' });

    const andere = await fetch(`${basis}/`, { redirect: 'manual' });

    assert.equal(andere.status, 302, 'Die allgemeine Seite wurde mit abgewiesen');
  });
});

test('normales Blättern läuft nicht in die allgemeine Grenze', async () => {
  await mitApp(async ({ basis }) => {
    for (let i = 0; i < 60; i += 1) {
      const antwort = await fetch(`${basis}/`, { redirect: 'manual' });
      assert.equal(antwort.status, 302, `Anfrage ${i + 1} wurde abgewiesen`);
    }
  });
});
