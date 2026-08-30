import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mitApp } from '../hilfen/app.mjs';

test('eine unbekannte Adresse antwortet mit 404 statt mit einem Absturz', async () => {
  await mitApp(async ({ basis }) => {
    const antwort = await fetch(`${basis}/gibt-es-nicht`, { redirect: 'manual' });

    assert.equal(antwort.status, 404);
  });
});

test('der Server verraet seine Technik nicht im X-Powered-By-Kopf', async () => {
  await mitApp(async ({ basis }) => {
    const antwort = await fetch(`${basis}/login`);

    assert.equal(antwort.headers.get('x-powered-by'), null);
  });
});
