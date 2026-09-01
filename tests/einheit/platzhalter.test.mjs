import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ersetze, PLATZHALTER, beispielWerte } from '../../src/nachricht/platzhalter.mjs';

const WERTE = {
  user: 'Anna',
  tag: 'anna',
  guild: 'Mein Server',
  role: 'Verifiziert',
  count: 42,
};

test('jeder bekannte Platzhalter wird durch seinen Wert ersetzt', () => {
  assert.equal(ersetze('Hallo {user}!', WERTE), 'Hallo Anna!');
  assert.equal(ersetze('@{tag}', WERTE), '@anna');
  assert.equal(ersetze('auf {guild}', WERTE), 'auf Mein Server');
  assert.equal(ersetze('Rolle {role}', WERTE), 'Rolle Verifiziert');
  assert.equal(ersetze('{count} Stück', WERTE), '42 Stück');
});

test('derselbe Platzhalter mehrfach im Text wird überall ersetzt', () => {
  assert.equal(ersetze('{user}, {user} und nochmal {user}', WERTE), 'Anna, Anna und nochmal Anna');
});

test('ein unbekannter Platzhalter bleibt stehen, statt zu verschwinden', () => {
  // Verschwinden waere schlimmer: Dann faellt der Tippfehler erst dem
  // Empfaenger auf, und die Nachricht ist schon raus.
  assert.equal(ersetze('Hallo {usr}!', WERTE), 'Hallo {usr}!');
});

test('ein bekannter Platzhalter ohne Wert bleibt ebenfalls stehen', () => {
  assert.equal(ersetze('Rolle {role}', { user: 'Anna' }), 'Rolle {role}');
});

test('doppelte Klammern schreiben den Platzhalter als Text', () => {
  assert.equal(ersetze('Schreibe {{user}} für den Namen', WERTE), 'Schreibe {user} für den Namen');
});

test('Text ohne Platzhalter bleibt unverändert', () => {
  assert.equal(ersetze('Nur Text', WERTE), 'Nur Text');
});

test('fehlender Text ergibt eine leere Zeichenkette, keinen Absturz', () => {
  assert.equal(ersetze(undefined, WERTE), '');
  assert.equal(ersetze(null, WERTE), '');
  assert.equal(ersetze('', WERTE), '');
});

test('ohne Werte bleibt jeder Platzhalter stehen', () => {
  assert.equal(ersetze('Hallo {user}', {}), 'Hallo {user}');
  assert.equal(ersetze('Hallo {user}'), 'Hallo {user}');
});

test('ein Wert, der selbst wie ein Platzhalter aussieht, wird nicht erneut ersetzt', () => {
  const ergebnis = ersetze('{user}', { user: '{guild}', guild: 'Mein Server' });

  assert.equal(ergebnis, '{guild}', 'Der eingesetzte Wert wurde ein zweites Mal durchsucht');
});

test('Groß- und Kleinschreibung des Platzhalters spielt keine Rolle', () => {
  assert.equal(ersetze('Hallo {User}', WERTE), 'Hallo Anna');
  assert.equal(ersetze('Hallo {USER}', WERTE), 'Hallo Anna');
});

test('die Liste der Platzhalter nennt Namen und Erklärung für die Knopfreihe', () => {
  assert.ok(PLATZHALTER.length >= 5);
  for (const eintrag of PLATZHALTER) {
    assert.match(eintrag.name, /^\{[a-z]+\}$/);
    assert.ok(eintrag.erklaerung.length > 5, `${eintrag.name} hat keine Erklärung`);
  }
});

test('die Beispielwerte decken alle Platzhalter ab — sonst zeigt die Vorschau Lücken', () => {
  const beispiel = beispielWerte();

  for (const eintrag of PLATZHALTER) {
    const schluessel = eintrag.name.slice(1, -1);
    assert.ok(beispiel[schluessel] !== undefined, `Für ${eintrag.name} fehlt ein Beispielwert`);
  }
});

test('mit den Beispielwerten bleibt kein Platzhalter im Text stehen', () => {
  const text = PLATZHALTER.map((p) => p.name).join(' ');

  assert.ok(!/\{[a-z]+\}/i.test(ersetze(text, beispielWerte())));
});
