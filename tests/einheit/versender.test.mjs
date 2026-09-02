import { test } from 'node:test';
import assert from 'node:assert/strict';
import { erstelleBot } from '../../src/discord/bot.mjs';
import { erstelleVersender } from '../../src/discord/versender.mjs';
import { erstelleLogger } from '../../src/kern/logger.mjs';
import { erstelleClientDoppel, KANALART } from '../hilfen/discord-doppel.mjs';

const GILDE = '111111111111111111';
const MITGLIEDER = [
  { id: 'm1', name: 'Anna', rollen: [] },
  { id: 'm2', name: 'Bert', rollen: [] },
];
const KANAELE = [{ id: 'k1', name: 'allgemein', type: KANALART.TEXT }];

async function mitVersender(optionen = {}) {
  const doppel = erstelleClientDoppel({ guildId: GILDE, mitglieder: MITGLIEDER, kanaele: KANAELE, ...optionen });
  const bot = erstelleBot({
    konfig: { token: 'x'.repeat(40), guildId: GILDE },
    logger: erstelleLogger({ schreibe: () => {} }),
    erzeugeClient: () => doppel.client,
  });
  await bot.verbinde();
  await new Promise((f) => setTimeout(f, 0));
  return { versender: erstelleVersender({ bot, konfig: { guildId: GILDE } }), doppel };
}

test('eine Direktnachricht erreicht den richtigen Empfänger', async () => {
  const { versender, doppel } = await mitVersender();

  await versender.sendeDm({ id: 'm1', name: 'Anna' }, { text: 'Hallo {user}' });

  assert.equal(doppel.gesendet.length, 1);
  assert.equal(doppel.gesendet[0].ziel, 'm1');
  assert.equal(doppel.gesendet[0].nutzlast.content, 'Hallo Anna');
});

test('die Platzhalter werden je Empfänger eingesetzt', async () => {
  const { versender, doppel } = await mitVersender();

  await versender.sendeDm({ id: 'm1', name: 'Anna' }, { text: 'Hallo {user}' });
  await versender.sendeDm({ id: 'm2', name: 'Bert' }, { text: 'Hallo {user}' });

  assert.deepEqual(doppel.gesendet.map((g) => g.nutzlast.content), ['Hallo Anna', 'Hallo Bert']);
});

test('der Servername steht als Platzhalter zur Verfügung', async () => {
  const { versender, doppel } = await mitVersender({ gildenName: 'Mein Server' });

  await versender.sendeDm({ id: 'm1', name: 'Anna' }, { text: 'auf {guild}' });

  assert.equal(doppel.gesendet[0].nutzlast.content, 'auf Mein Server');
});

test('ein abgelehnter Empfänger wirft weiter, damit die Warteschlange es merkt', async () => {
  const abgelehnt = Object.assign(new Error('Cannot send messages to this user'), { code: 50007 });
  const { versender } = await mitVersender({ dmFehler: { m1: abgelehnt } });

  await assert.rejects(
    () => versender.sendeDm({ id: 'm1', name: 'Anna' }, { text: 'Hallo' }),
    (fehler) => fehler.code === 50007,
  );
});

test('eine Nachricht ohne Inhalt wird gar nicht erst geschickt', async () => {
  const { versender, doppel } = await mitVersender();

  await assert.rejects(() => versender.sendeDm({ id: 'm1', name: 'Anna' }, { text: '' }));

  assert.equal(doppel.gesendet.length, 0);
});

test('eine Kanalnachricht landet im richtigen Kanal', async () => {
  const { versender, doppel } = await mitVersender();

  await versender.sendeInKanal('k1', { text: 'Hallo an alle' });

  assert.equal(doppel.gesendet[0].art, 'kanal');
  assert.equal(doppel.gesendet[0].ziel, 'k1');
});

test('ein Kanal, den es nicht gibt, wirft einen benennbaren Fehler', async () => {
  const { versender } = await mitVersender();

  await assert.rejects(() => versender.sendeInKanal('gibt-es-nicht', { text: 'x' }));
});

test('ohne verbundenen Bot wird nichts verschickt', async () => {
  const doppel = erstelleClientDoppel({ guildId: GILDE, mitglieder: MITGLIEDER });
  const bot = erstelleBot({
    konfig: { token: 'x'.repeat(40), guildId: GILDE },
    logger: erstelleLogger({ schreibe: () => {} }),
    erzeugeClient: () => doppel.client,
  });
  const versender = erstelleVersender({ bot, konfig: { guildId: GILDE } });

  await assert.rejects(() => versender.sendeDm({ id: 'm1', name: 'Anna' }, { text: 'x' }));
  assert.equal(doppel.gesendet.length, 0);
});
