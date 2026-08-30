import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { mitApp, GILDE } from '../hilfen/app.mjs';
import { verlangt, stufenMiddleware } from '../../src/web/mw/verlangt.mjs';
import { STUFE } from '../../src/auth/rechte.mjs';

const SITZUNG_COOKIE = 'panel_sitzung';

/** Meldet ein bestimmtes Discord-Konto an und liefert den Cookie-Kopf. */
async function alsKonto(basis, sitzungen, discordUserId, anzeigename = 'Test') {
  const { kennung } = sitzungen.lege_an(GILDE, { discordUserId, anzeigename });
  return { cookie: `${SITZUNG_COOKIE}=${encodeURIComponent(kennung)}` };
}

test('der Owner aus der .env kommt herein, auch ganz ohne Rollen', async () => {
  await mitApp(
    async ({ basis, sitzungen, konfig }) => {
      const { cookie } = await alsKonto(basis, sitzungen, konfig.ownerId, 'Owner');

      const antwort = await fetch(`${basis}/`, { redirect: 'manual', headers: { cookie } });

      assert.equal(antwort.status, 200);
    },
    { rollen: {} },
  );
});

test('wer keine zugeordnete Rolle hat, sieht nur die Abweisungsseite', async () => {
  await mitApp(
    async ({ basis, sitzungen }) => {
      const { cookie } = await alsKonto(basis, sitzungen, '9999', 'Fremd');

      const antwort = await fetch(`${basis}/`, { redirect: 'manual', headers: { cookie } });
      const text = await antwort.text();

      assert.equal(antwort.status, 403);
      assert.match(text, /kein Zugriff|nicht freigeschaltet/i);
      assert.ok(!/Angemeldet als/.test(text), 'Die Übersicht wurde trotzdem ausgeliefert');
    },
    { rollen: { 9999: ['777'] }, zugriffsregeln: [['555', STUFE.MODERATOR]] },
  );
});

test('wer nicht Mitglied des Servers ist, sieht ebenfalls nur die Abweisung', async () => {
  await mitApp(
    async ({ basis, sitzungen }) => {
      const { cookie } = await alsKonto(basis, sitzungen, '9999', 'Fremd');

      const antwort = await fetch(`${basis}/`, { redirect: 'manual', headers: { cookie } });

      assert.equal(antwort.status, 403);
    },
    { rollen: {}, zugriffsregeln: [['555', STUFE.MODERATOR]] },
  );
});

test('eine zugeordnete Moderatorrolle öffnet die Übersicht', async () => {
  await mitApp(
    async ({ basis, sitzungen }) => {
      const { cookie } = await alsKonto(basis, sitzungen, '9999', 'Mod');

      const antwort = await fetch(`${basis}/`, { redirect: 'manual', headers: { cookie } });

      assert.equal(antwort.status, 200);
    },
    { rollen: { 9999: ['555'] }, zugriffsregeln: [['555', STUFE.MODERATOR]] },
  );
});

test('eine entzogene Rolle wirkt sofort, ohne Abmelden', async () => {
  await mitApp(
    async ({ basis, sitzungen, zugriff }) => {
      const { cookie } = await alsKonto(basis, sitzungen, '9999', 'Mod');
      assert.equal((await fetch(`${basis}/`, { redirect: 'manual', headers: { cookie } })).status, 200);

      zugriff.entferne(GILDE, '555');

      const danach = await fetch(`${basis}/`, { redirect: 'manual', headers: { cookie } });
      assert.equal(danach.status, 403, 'Die Stufe wurde aus der Sitzung statt neu bestimmt');
    },
    { rollen: { 9999: ['555'] }, zugriffsregeln: [['555', STUFE.MODERATOR]] },
  );
});

test('die Abweisungsseite nennt keine Namen von Seiten, die es dahinter gibt', async () => {
  await mitApp(
    async ({ basis, sitzungen }) => {
      const { cookie } = await alsKonto(basis, sitzungen, '9999', 'Fremd');

      const text = await (await fetch(`${basis}/`, { redirect: 'manual', headers: { cookie } })).text();

      assert.ok(!/rollenregeln|aktionsleisten|vorlagen/i.test(text));
    },
    { rollen: {} },
  );
});

test('die Stufen-Middleware setzt genau die Stufe, die sich aus den Rollen ergibt', async () => {
  const app = express();
  app.use((req, _res, next) => {
    req.sitzung = { discordUserId: '9999', guildId: GILDE };
    next();
  });
  app.use(
    stufenMiddleware({
      konfig: { ownerId: '4242', guildId: GILDE },
      zugriff: { stufeFuerRollen: (_g, rollen) => (rollen.includes('555') ? STUFE.MODERATOR : undefined) },
      mitgliedschaft: { rollenVon: () => ['555'] },
    }),
  );
  app.get('/', verlangt(STUFE.MODERATOR), (req, res) => res.send(req.stufe));

  const server = app.listen(0, '127.0.0.1');
  await new Promise((f) => server.once('listening', f));
  try {
    const antwort = await fetch(`http://127.0.0.1:${server.address().port}/`);
    assert.equal(await antwort.text(), STUFE.MODERATOR);
  } finally {
    await new Promise((f) => server.close(f));
  }
});
