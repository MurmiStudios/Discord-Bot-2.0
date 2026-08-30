import { test } from 'node:test';
import assert from 'node:assert/strict';
import { erstelleLogger } from '../../src/kern/logger.mjs';

const TOKEN = 'MTIzNDU2Nzg5MDEyMzQ1Njc4.GaBcDe.beispielhafter-token-wert';

/** Logger, der in ein Array schreibt statt nach stdout. */
function protokollierenderLogger(geheimnisse = [TOKEN]) {
  const zeilen = [];
  const logger = erstelleLogger({ geheimnisse, schreibe: (zeile) => zeilen.push(zeile) });
  return { logger, zeilen, letzte: () => JSON.parse(zeilen.at(-1)) };
}

test('schreibt eine Zeile mit Zeit, Stufe, Bereich und Meldung', () => {
  const { logger, letzte } = protokollierenderLogger();

  logger.info('start', 'Panel läuft');

  const eintrag = letzte();
  assert.equal(eintrag.stufe, 'info');
  assert.equal(eintrag.bereich, 'start');
  assert.equal(eintrag.meldung, 'Panel läuft');
  assert.ok(!Number.isNaN(Date.parse(eintrag.zeit)), 'zeit ist kein gueltiger Zeitstempel');
});

test('jede Zeile ist fuer sich gueltiges JSON', () => {
  const { logger, zeilen } = protokollierenderLogger();

  logger.info('a', 'eins');
  logger.warn('b', 'zwei');

  assert.equal(zeilen.length, 2);
  for (const zeile of zeilen) assert.doesNotThrow(() => JSON.parse(zeile));
});

test('maskiert ein Geheimnis, das direkt in den Daten steht', () => {
  const { logger, zeilen } = protokollierenderLogger();

  logger.info('discord', 'Anmeldung', { token: TOKEN });

  assert.ok(!zeilen[0].includes(TOKEN), 'Der Token steht in der Ausgabe');
});

test('maskiert ein Geheimnis, das tief in einem Objekt steckt', () => {
  const { logger, zeilen } = protokollierenderLogger();

  logger.info('discord', 'Anfrage', { anfrage: { kopf: { autorisierung: `Bot ${TOKEN}` } } });

  assert.ok(!zeilen[0].includes(TOKEN), 'Der Token steht in der Ausgabe');
});

test('maskiert ein Geheimnis mitten in einem laengeren Text', () => {
  const { logger, zeilen } = protokollierenderLogger();

  logger.warn('discord', `Der Aufruf mit ${TOKEN} wurde abgewiesen`);

  assert.ok(!zeilen[0].includes(TOKEN), 'Der Token steht in der Meldung');
  assert.match(zeilen[0], /abgewiesen/);
});

test('maskiert ein Geheimnis in Meldung und Stapelabbild eines Fehlers', () => {
  const { logger, zeilen } = protokollierenderLogger();

  logger.fehler('discord', 'Verbindung gescheitert', new Error(`Ungueltiger Token ${TOKEN}`));

  assert.ok(!zeilen[0].includes(TOKEN), 'Der Token steht im Fehler');
  assert.match(zeilen[0], /Ungueltiger Token/);
});

test('maskiert nach Feldnamen, auch wenn der Wert kein bekanntes Geheimnis ist', () => {
  const { logger, letzte } = protokollierenderLogger([]);

  logger.info('auth', 'Sitzung', { clientSecret: 'nie-gesehener-wert', name: 'Anna' });

  const eintrag = letzte();
  assert.notEqual(eintrag.daten.clientSecret, 'nie-gesehener-wert');
  assert.equal(eintrag.daten.name, 'Anna', 'Harmlose Felder duerfen nicht maskiert werden');
});

test('ein sehr kurzes Geheimnis maskiert nicht die halbe Ausgabe', () => {
  const { logger, letzte } = protokollierenderLogger(['a']);

  logger.info('start', 'Panel', { name: 'Anna' });

  assert.equal(letzte().daten.name, 'Anna');
});

test('leere Geheimnisse werden uebergangen statt alles zu maskieren', () => {
  const { logger, letzte } = protokollierenderLogger(['', undefined, null]);

  logger.info('start', 'Panel', { name: 'Anna' });

  assert.equal(letzte().daten.name, 'Anna');
});

test('ein Ringbezug in den Daten laesst den Logger nicht abstuerzen', () => {
  const { logger, letzte } = protokollierenderLogger();
  const ring = { name: 'Anna' };
  ring.selbst = ring;

  assert.doesNotThrow(() => logger.info('start', 'Ring', ring));
  assert.equal(letzte().daten.name, 'Anna');
});

test('die Stufen info, warn und fehler landen als solche in der Ausgabe', () => {
  const { logger, zeilen } = protokollierenderLogger();

  logger.info('a', 'x');
  logger.warn('a', 'x');
  logger.fehler('a', 'x');

  assert.deepEqual(
    zeilen.map((z) => JSON.parse(z).stufe),
    ['info', 'warn', 'fehler'],
  );
});
