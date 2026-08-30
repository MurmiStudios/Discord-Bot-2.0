import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

/**
 * Oeffnet die SQLite-Datei und stellt die beiden Schalter, die im Betrieb
 * zaehlen:
 *
 * - `foreign_keys` ist in SQLite standardmaessig AUS. Ohne diesen Schalter
 *   hinterlaesst jedes Loeschen verwaiste Zeilen, und zwar still.
 * - `journal_mode = WAL` laesst Lesen und Schreiben nebeneinander laufen.
 *   Ohne ihn blockiert ein laufender Massenversand jede Seite im Panel.
 */
export function oeffneDatenbank(pfad) {
  mkdirSync(dirname(pfad), { recursive: true });

  const db = new DatabaseSync(pfad);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec('PRAGMA busy_timeout = 5000');
  return db;
}
