import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

/**
 * Die Abdeckung der Kette wird geprüft, nicht behauptet.
 *
 * Der Plan verlangt für `src/aktionen/kette.mjs` 100 %. Ohne diesen Test wäre
 * das eine Zahl in einem Dokument: Der nächste Zweig, den jemand einbaut und
 * nicht prüft, fiele niemandem auf.
 */
test('src/aktionen/kette.mjs ist zu 100 % abgedeckt', () => {
  // Node gibt Kindprozessen eines Testlaufs einen eigenen Berichtsmodus mit.
  // Der unterdrückt die Abdeckungstabelle — deshalb wird er hier abgestreift.
  const umgebung = { ...process.env };
  delete umgebung.NODE_TEST_CONTEXT;

  const ausgabe = execFileSync(
    process.execPath,
    ['--test', '--experimental-test-coverage', 'tests/einheit/kette.test.mjs'],
    { encoding: 'utf8', cwd: new URL('../..', import.meta.url).pathname, env: umgebung },
  );

  const zeile = ausgabe.split('\n').find((z) => z.includes('kette.mjs'));
  assert.ok(zeile, 'In der Abdeckungstabelle steht keine Zeile für kette.mjs');

  // Spalten: Datei | Zeilen | Zweige | Funktionen
  const zahlen = zeile.match(/\d+\.\d+/g) ?? [];
  assert.deepEqual(
    zahlen.slice(0, 3),
    ['100.00', '100.00', '100.00'],
    `Abdeckung von kette.mjs ist nicht vollständig: ${zeile.trim()}`,
  );
});
