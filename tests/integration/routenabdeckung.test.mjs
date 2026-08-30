import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { routenUebersicht } from '../../src/web/routen.mjs';
import { verlangt, oeffentlich } from '../../src/web/mw/verlangt.mjs';
import { STUFE } from '../../src/auth/rechte.mjs';
import { mitApp } from '../hilfen/app.mjs';

test('jede Route der App ist einer Zugriffsstufe zugeordnet', async () => {
  await mitApp(async ({ app }) => {
    const ohneStufe = routenUebersicht(app).filter((r) => r.stufe === undefined);

    assert.deepEqual(
      ohneStufe.map((r) => `${r.methode} ${r.pfad}`),
      [],
      'Diese Routen tragen weder verlangt(...) noch oeffentlich() — sie wären ungeschützt',
    );
  });
});

test('die Prüfung schlägt an, sobald eine Route ohne Stufe hinzukommt', () => {
  // Beweis, dass der Test oben nicht nur zufällig grün ist.
  const app = express();
  app.get('/geschuetzt', verlangt(STUFE.MODERATOR), (_q, s) => s.end());
  app.get('/offen', oeffentlich(), (_q, s) => s.end());
  app.get('/vergessen', (_q, s) => s.end());

  const ohneStufe = routenUebersicht(app).filter((r) => r.stufe === undefined);

  assert.deepEqual(ohneStufe.map((r) => r.pfad), ['/vergessen']);
});

test('die Übersicht nennt Methode, Pfad und Stufe jeder Route', () => {
  const app = express();
  app.post('/rollenregeln', verlangt(STUFE.MODERATOR), (_q, s) => s.end());

  assert.deepEqual(routenUebersicht(app), [
    { methode: 'POST', pfad: '/rollenregeln', stufe: STUFE.MODERATOR },
  ]);
});

test('eine Route mit mehreren Methoden wird je Methode aufgeführt', () => {
  const app = express();
  app.route('/vorlagen').get(verlangt(STUFE.BETRACHTER), (_q, s) => s.end())
    .post(verlangt(STUFE.MODERATOR), (_q, s) => s.end());

  const uebersicht = routenUebersicht(app);
  assert.equal(uebersicht.length, 2);
  assert.deepEqual(
    uebersicht.map((r) => `${r.methode}:${r.stufe}`).sort(),
    ['GET:BETRACHTER', 'POST:MODERATOR'],
  );
});
