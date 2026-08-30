import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { oeffneDatenbank } from '../../src/daten/db.mjs';
import { migriere } from '../../src/daten/migrieren.mjs';
import { mitTempVerzeichnis } from '../hilfen/db.mjs';

const MIGRATIONEN = [
  { nummer: 1, name: 'erste', sql: 'CREATE TABLE a (id INTEGER PRIMARY KEY);' },
  { nummer: 2, name: 'zweite', sql: 'CREATE TABLE b (id INTEGER PRIMARY KEY);' },
];

function tabellen(db) {
  return db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
    .all()
    .map((z) => z.name);
}

test('legt die Tabellen an und merkt sich die erreichte Version', async () => {
  await mitTempVerzeichnis(async (dir) => {
    const db = oeffneDatenbank(join(dir, 'panel.db'));

    const angewendet = migriere(db, MIGRATIONEN);

    assert.equal(angewendet, 2);
    assert.ok(tabellen(db).includes('a'));
    assert.ok(tabellen(db).includes('b'));
    db.close();
  });
});

test('ein zweiter Lauf ist folgenlos', async () => {
  await mitTempVerzeichnis(async (dir) => {
    const db = oeffneDatenbank(join(dir, 'panel.db'));
    migriere(db, MIGRATIONEN);
    const vorher = tabellen(db);

    const angewendet = migriere(db, MIGRATIONEN);

    assert.equal(angewendet, 0, 'Es wurde erneut migriert');
    assert.deepEqual(tabellen(db), vorher);
    db.close();
  });
});

test('eine spaeter hinzugekommene Migration wird nachgezogen', async () => {
  await mitTempVerzeichnis(async (dir) => {
    const db = oeffneDatenbank(join(dir, 'panel.db'));
    migriere(db, MIGRATIONEN);

    const angewendet = migriere(db, [
      ...MIGRATIONEN,
      { nummer: 3, name: 'dritte', sql: 'CREATE TABLE c (id INTEGER PRIMARY KEY);' },
    ]);

    assert.equal(angewendet, 1);
    assert.ok(tabellen(db).includes('c'));
    db.close();
  });
});

test('Migrationen laufen numerisch, nicht alphabetisch', async () => {
  await mitTempVerzeichnis(async (dir) => {
    const db = oeffneDatenbank(join(dir, 'panel.db'));

    // Absichtlich verdrehte Reihenfolge; 10 muss nach 9 laufen, nicht davor.
    migriere(db, [
      { nummer: 10, name: 'zehn', sql: 'INSERT INTO reihenfolge (schritt) VALUES (10);' },
      { nummer: 1, name: 'eins', sql: 'CREATE TABLE reihenfolge (schritt INTEGER);' },
      { nummer: 9, name: 'neun', sql: 'INSERT INTO reihenfolge (schritt) VALUES (9);' },
    ]);

    const schritte = db.prepare('SELECT schritt FROM reihenfolge').all().map((z) => z.schritt);
    assert.deepEqual(schritte, [9, 10]);
    db.close();
  });
});

test('eine fehlerhafte Migration bricht ab, ohne die Version zu erhoehen', async () => {
  await mitTempVerzeichnis(async (dir) => {
    const db = oeffneDatenbank(join(dir, 'panel.db'));
    migriere(db, MIGRATIONEN);

    assert.throws(() =>
      migriere(db, [
        ...MIGRATIONEN,
        { nummer: 3, name: 'kaputt', sql: 'CREATE TABLE ;;; kein gueltiges SQL' },
      ]),
    );

    const version = db.prepare('SELECT MAX(nummer) AS v FROM schema_version').get().v;
    assert.equal(version, 2, 'Die Version wurde trotz Fehler erhoeht');
    db.close();
  });
});

test('eine fehlerhafte Migration hinterlaesst keine halbe Tabelle', async () => {
  await mitTempVerzeichnis(async (dir) => {
    const db = oeffneDatenbank(join(dir, 'panel.db'));

    assert.throws(() =>
      migriere(db, [
        {
          nummer: 1,
          name: 'halb',
          sql: 'CREATE TABLE gut (id INTEGER); CREATE TABLE ;;; kaputt',
        },
      ]),
    );

    assert.ok(!tabellen(db).includes('gut'), 'Die erste Anweisung wurde nicht zurueckgerollt');
    db.close();
  });
});

test('Fremdschluessel sind aktiv und der WAL-Modus ist eingeschaltet', async () => {
  await mitTempVerzeichnis(async (dir) => {
    const db = oeffneDatenbank(join(dir, 'panel.db'));

    assert.equal(db.prepare('PRAGMA foreign_keys').get().foreign_keys, 1);
    assert.equal(db.prepare('PRAGMA journal_mode').get().journal_mode, 'wal');
    db.close();
  });
});

test('aktive Fremdschluessel verhindern eine verwaiste Zeile', async () => {
  await mitTempVerzeichnis(async (dir) => {
    const db = oeffneDatenbank(join(dir, 'panel.db'));
    migriere(db, [
      {
        nummer: 1,
        name: 'bezug',
        sql:
          'CREATE TABLE eltern (id INTEGER PRIMARY KEY);' +
          'CREATE TABLE kind (id INTEGER PRIMARY KEY, eltern_id INTEGER NOT NULL REFERENCES eltern(id));',
      },
    ]);

    assert.throws(() => db.prepare('INSERT INTO kind (eltern_id) VALUES (99)').run());
    db.close();
  });
});

test('liest Migrationen aus einem Verzeichnis und sortiert sie numerisch', async () => {
  const { writeFileSync } = await import('node:fs');
  const { ladeMigrationen } = await import('../../src/daten/migrieren.mjs');

  await mitTempVerzeichnis(async (dir) => {
    writeFileSync(join(dir, '002-zweite.sql'), 'CREATE TABLE b (id INTEGER);');
    writeFileSync(join(dir, '010-zehnte.sql'), 'CREATE TABLE j (id INTEGER);');
    writeFileSync(join(dir, '001-erste.sql'), 'CREATE TABLE a (id INTEGER);');
    writeFileSync(join(dir, 'liesmich.txt'), 'keine Migration');

    const geladen = ladeMigrationen(dir);

    assert.deepEqual(
      geladen.map((m) => m.nummer),
      [1, 2, 10],
      'Alphabetisch waere 1, 10, 2 — das waere falsch',
    );
    assert.deepEqual(
      geladen.map((m) => m.name),
      ['erste', 'zweite', 'zehnte'],
    );
    assert.match(geladen[0].sql, /CREATE TABLE a/);
  });
});

test('Dateien ohne fuehrende Nummer werden uebergangen', async () => {
  const { writeFileSync } = await import('node:fs');
  const { ladeMigrationen } = await import('../../src/daten/migrieren.mjs');

  await mitTempVerzeichnis(async (dir) => {
    writeFileSync(join(dir, 'entwurf.sql'), 'DROP TABLE alles;');
    writeFileSync(join(dir, '001-erste.sql'), 'CREATE TABLE a (id INTEGER);');

    assert.deepEqual(ladeMigrationen(dir).map((m) => m.name), ['erste']);
  });
});
