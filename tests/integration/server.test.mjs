import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mitServer } from '../hilfen/server.mjs';

test('GET / antwortet mit einer Statusmeldung', async () => {
  await mitServer(async (basis) => {
    const antwort = await fetch(`${basis}/`);

    assert.equal(antwort.status, 200);
    assert.match(antwort.headers.get('content-type') ?? '', /text\/html/);
    assert.match(await antwort.text(), /Panel läuft/);
  });
});

test('eine unbekannte Adresse antwortet mit 404 statt mit einem Absturz', async () => {
  await mitServer(async (basis) => {
    const antwort = await fetch(`${basis}/gibt-es-nicht`);

    assert.equal(antwort.status, 404);
  });
});

test('der Server verraet seine Technik nicht im X-Powered-By-Kopf', async () => {
  await mitServer(async (basis) => {
    const antwort = await fetch(`${basis}/`);

    assert.equal(antwort.headers.get('x-powered-by'), null);
  });
});
