import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const SCHEMA_VERSION = `
  CREATE TABLE IF NOT EXISTS schema_version (
    nummer        INTEGER PRIMARY KEY,
    name          TEXT NOT NULL,
    angewendet_am TEXT NOT NULL
  )
`;

/**
 * Wendet alle noch nicht gelaufenen Migrationen in numerischer Reihenfolge an.
 *
 * Jede Migration laeuft in einer eigenen Transaktion samt ihrem Eintrag in
 * `schema_version`. Scheitert sie, wird beides zurueckgerollt — es gibt also
 * keinen Zustand, in dem die halbe Migration steht und die Versionsnummer
 * behauptet, sie sei fertig.
 *
 * @returns {number} Anzahl der angewendeten Migrationen
 */
export function migriere(db, migrationen) {
  db.exec(SCHEMA_VERSION);

  const bereitsGelaufen = new Set(
    db.prepare('SELECT nummer FROM schema_version').all().map((z) => z.nummer),
  );

  const offene = [...migrationen]
    .filter((m) => !bereitsGelaufen.has(m.nummer))
    .sort((a, b) => a.nummer - b.nummer);

  const merken = db.prepare(
    'INSERT INTO schema_version (nummer, name, angewendet_am) VALUES (?, ?, ?)',
  );

  for (const migration of offene) {
    db.exec('BEGIN');
    try {
      db.exec(migration.sql);
      merken.run(migration.nummer, migration.name, new Date().toISOString());
      db.exec('COMMIT');
    } catch (fehler) {
      db.exec('ROLLBACK');
      fehler.message = `Migration ${migration.nummer} (${migration.name}) ist gescheitert: ${fehler.message}`;
      throw fehler;
    }
  }

  return offene.length;
}

/** Dateiname `007-name.sql` ergibt `{ nummer: 7, name: 'name' }`. */
const DATEINAME = /^(\d+)-(.+)\.sql$/;

/** Liest die Migrationen aus einem Verzeichnis. Dateien ohne Nummer werden ignoriert. */
export function ladeMigrationen(verzeichnis) {
  return readdirSync(verzeichnis)
    .map((datei) => {
      const treffer = DATEINAME.exec(datei);
      if (!treffer) return null;
      return {
        nummer: Number.parseInt(treffer[1], 10),
        name: treffer[2],
        sql: readFileSync(join(verzeichnis, datei), 'utf8'),
      };
    })
    .filter((m) => m !== null)
    .sort((a, b) => a.nummer - b.nummer);
}
