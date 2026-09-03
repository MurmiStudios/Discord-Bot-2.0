import { test } from 'node:test';
import assert from 'node:assert/strict';
import { erstelleBot } from '../../src/discord/bot.mjs';
import { erstelleLogger } from '../../src/kern/logger.mjs';
import { erstelleClientDoppel } from '../hilfen/discord-doppel.mjs';

const TOKEN = 'MTIzNDU2Nzg5MDEyMzQ1Njc4.GaBcDe.geheimer-bot-token-wert';
const KONFIG = { token: TOKEN, guildId: '111111111111111111' };

function baueBot(doppelOptionen = {}) {
  const zeilen = [];
  const logger = erstelleLogger({ geheimnisse: [TOKEN], schreibe: (z) => zeilen.push(z) });
  const { client } = erstelleClientDoppel(doppelOptionen);
  const bot = erstelleBot({ konfig: KONFIG, logger, erzeugeClient: () => client });
  return { bot, client, zeilen };
}

/** Wartet, bis das Ereignis aus der Microtask-Warteschlange durch ist. */
const gleich = () => new Promise((f) => setTimeout(f, 0));

test('vor dem Verbinden meldet der Bot sich als nicht verbunden, mit Grund', () => {
  const { bot } = baueBot();

  const status = bot.status();
  assert.equal(status.verbunden, false);
  assert.ok(status.grund, 'Es fehlt der Grund');
});

test('nach dem Verbinden meldet der Bot sich als verbunden', async () => {
  const { bot } = baueBot();

  await bot.verbinde();
  await gleich();

  assert.equal(bot.status().verbunden, true);
});

test('zum Verbinden wird der Token aus der Konfiguration benutzt', async () => {
  const { bot, client } = baueBot();

  await bot.verbinde();

  assert.equal(client.angemeldetMit, TOKEN);
});

test('ein ungueltiger Token wird als lesbarer Grund gemeldet, nicht als Absturz', async () => {
  const { bot } = baueBot({ anmeldungScheitert: true });

  await assert.doesNotReject(() => bot.verbinde());

  const status = bot.status();
  assert.equal(status.verbunden, false);
  assert.match(status.grund, /Token/i);
});

test('der Grund sagt, was zu pruefen ist — nicht nur, dass etwas kaputt ist', async () => {
  const { bot } = baueBot({ anmeldungScheitert: true });
  await bot.verbinde();

  assert.match(bot.status().grund, /DISCORD_TOKEN|Entwicklerportal/i);
});

test('ein Verbindungsabbruch schaltet den Status um', async () => {
  const { bot, client } = baueBot();
  await bot.verbinde();
  await gleich();

  client.emit('shardDisconnect', { code: 1006 }, 0);

  assert.equal(bot.status().verbunden, false);
  assert.match(bot.status().grund, /Verbindung/i);
});

test('nach einem Wiederaufbau ist der Bot wieder verbunden', async () => {
  const { bot, client } = baueBot();
  await bot.verbinde();
  await gleich();
  client.emit('shardDisconnect', { code: 1006 }, 0);

  client.emit('shardResume', 0, 5);

  assert.equal(bot.status().verbunden, true);
});

test('ein Fehler vom Client stuerzt den Prozess nicht ab, sondern wird protokolliert', async () => {
  const { bot, client, zeilen } = baueBot();
  await bot.verbinde();
  await gleich();

  client.emit('error', new Error('irgendetwas ging schief'));

  assert.ok(zeilen.some((z) => z.includes('irgendetwas ging schief')));
});

test('der Bot-Token taucht in keiner Protokollzeile auf', async () => {
  const { bot, client, zeilen } = baueBot();
  await bot.verbinde();
  await gleich();
  client.emit('error', new Error(`Token ${TOKEN} abgelehnt`));

  assert.ok(!zeilen.join('\n').includes(TOKEN), 'Der Token steht im Protokoll');
});

test('Beenden faehrt den Client herunter', async () => {
  const { bot, client } = baueBot();
  await bot.verbinde();

  await bot.beende();

  assert.equal(client.zerstoert, true);
  assert.equal(bot.status().verbunden, false);
});

test('der verbundene Bot gibt seine Gilde heraus, eine fremde nicht', async () => {
  const { bot } = baueBot();
  await bot.verbinde();
  await gleich();

  assert.ok(bot.gilde());
  assert.equal(bot.gilde('999999999999999999'), undefined);
});

test('ohne Verbindung gibt es keine Gilde, aber auch keinen Absturz', () => {
  const { bot } = baueBot();

  assert.equal(bot.gilde(), undefined);
});

test('„Bot verbunden“ steht genau einmal im Log', async () => {
  // discord.js sendet `ready` und `clientReady` — wer auf beide horcht,
  // protokolliert alles doppelt. Auf dem ersten echten Server stand die Zeile
  // deshalb zweimal da.
  const zeilen = [];
  const logger = erstelleLogger({ schreibe: (zeile) => zeilen.push(zeile) });
  const { client } = erstelleClientDoppel({ guildId: KONFIG.guildId });
  const bot = erstelleBot({ konfig: KONFIG, logger, erzeugeClient: () => client });

  await bot.verbinde();
  await new Promise((fertig) => setTimeout(fertig, 0));

  const verbunden = zeilen.filter((zeile) => zeile.includes('Bot verbunden'));
  assert.equal(verbunden.length, 1, `„Bot verbunden“ steht ${verbunden.length}-mal im Log`);
  assert.equal(bot.status().verbunden, true);
});

test('beim Verbinden wird die Mitgliederliste geholt', async () => {
  // Discord schickt sie nicht von selbst: Der Intent erlaubt das Abrufen, er
  // erledigt es nicht. Ohne diesen Aufruf ist der Cache praktisch leer — genau
  // so sah es auf dem ersten echten Server aus.
  const zeilen = [];
  const logger = erstelleLogger({ schreibe: (zeile) => zeilen.push(zeile) });
  const { client } = erstelleClientDoppel({
    guildId: KONFIG.guildId,
    mitglieder: [
      { id: 'm1', name: 'Anna', rollen: [] },
      { id: 'm2', name: 'Bert', rollen: [] },
    ],
  });
  const bot = erstelleBot({ konfig: KONFIG, logger, erzeugeClient: () => client });

  await bot.verbinde();
  await new Promise((fertig) => setTimeout(fertig, 0));

  assert.equal(bot.status().mitglieder, 2);
  assert.equal(bot.status().mitgliederGrund, null);
  assert.ok(zeilen.some((z) => z.includes('Mitglieder geladen')));
});

test('lässt sich die Mitgliederliste nicht holen, steht der Grund im Status', async () => {
  const zeilen = [];
  const logger = erstelleLogger({ schreibe: (zeile) => zeilen.push(zeile) });
  const { client } = erstelleClientDoppel({
    guildId: KONFIG.guildId,
    mitgliederFehler: new Error('Members did not arrive in time.'),
  });
  const bot = erstelleBot({ konfig: KONFIG, logger, erzeugeClient: () => client });

  await bot.verbinde();
  await new Promise((fertig) => setTimeout(fertig, 0));

  // Verbunden ist er trotzdem — nur eben unvollständig.
  assert.equal(bot.status().verbunden, true);
  assert.equal(bot.status().mitglieder, null);
  assert.match(bot.status().mitgliederGrund, /Server Members Intent/);
});

test('ist der Bot gar nicht auf dem Server, sagt der Status das', async () => {
  const logger = erstelleLogger({ schreibe: () => {} });
  const { client } = erstelleClientDoppel({ guildId: '999999999999999999' });
  const bot = erstelleBot({ konfig: KONFIG, logger, erzeugeClient: () => client });

  await bot.verbinde();
  await new Promise((fertig) => setTimeout(fertig, 0));

  assert.match(bot.status().mitgliederGrund, /nicht auf dem Server/);
});
