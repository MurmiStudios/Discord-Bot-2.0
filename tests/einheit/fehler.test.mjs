import { test } from 'node:test';
import assert from 'node:assert/strict';
import { klartext, istVoruebergehend } from '../../src/discord/fehler.mjs';

/** Ein Fehler, wie discord.js ihn wirft. */
function discordFehler(code, meldung = 'irgendwas') {
  return Object.assign(new Error(meldung), { code });
}

test('50007 wird zu dem Satz, der das Problem wirklich beschreibt', () => {
  const text = klartext(discordFehler(50007));

  assert.match(text, /Direktnachricht/i);
  assert.ok(!text.includes('50007'), 'Die Zahl steht im Text');
});

test('50013 nennt fehlende Rechte statt einer Zahl', () => {
  assert.match(klartext(discordFehler(50013)), /Recht/i);
});

test('50001 nennt fehlenden Zugang', () => {
  assert.match(klartext(discordFehler(50001)), /Zugriff|Zugang/i);
});

test('10003, 10011 und 10013 benennen jeweils das richtige verschwundene Ding', () => {
  assert.match(klartext(discordFehler(10003)), /Kanal/i);
  assert.match(klartext(discordFehler(10011)), /Rolle/i);
  assert.match(klartext(discordFehler(10013)), /Konto|Nutzer|Person/i);
});

test('40003 beschreibt eine Bremse, keine Störung', () => {
  assert.match(klartext(discordFehler(40003)), /zu schnell|Pause|kurz/i);
});

test('ein unbekannter Code ergibt einen verständlichen Satz, nicht die nackte Zahl', () => {
  const text = klartext(discordFehler(99999, 'Something odd happened'));

  assert.ok(text.length > 20, 'Der Text ist zu knapp, um zu helfen');
  assert.match(text, /Discord/i);
});

test('der unbekannte Code darf zur Fehlersuche im Satz vorkommen — aber nicht allein stehen', () => {
  const text = klartext(discordFehler(99999));

  assert.notEqual(text.trim(), '99999');
});

test('ein Fehler ohne Code wird trotzdem lesbar beschrieben', () => {
  assert.match(klartext(new Error('Netzwerk weg')), /\S/);
});

test('auch ohne Fehlerobjekt kommt ein Satz zurück, kein leerer Text', () => {
  assert.ok(klartext(undefined).length > 0);
  assert.ok(klartext(null).length > 0);
});

test('nur eine Ratenbremse gilt als vorübergehend', () => {
  assert.equal(istVoruebergehend(discordFehler(40003)), true);
  assert.equal(istVoruebergehend(discordFehler(50007)), false);
  assert.equal(istVoruebergehend(discordFehler(50013)), false);
});

test('ein Netzwerkabbruch gilt ebenfalls als vorübergehend', () => {
  assert.equal(istVoruebergehend(discordFehler('ECONNRESET')), true);
  assert.equal(istVoruebergehend(discordFehler('ETIMEDOUT')), true);
});

test('ohne Fehler ist nichts vorübergehend', () => {
  assert.equal(istVoruebergehend(undefined), false);
});
