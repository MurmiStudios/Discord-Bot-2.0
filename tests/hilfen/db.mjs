import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Legt eine echte SQLite-Datei in einem Temp-Verzeichnis an und raeumt sie
 * hinterher auf. Bewusst keine Speicherdatenbank: der WAL-Modus und die
 * Fremdschluessel verhalten sich dort anders als im Betrieb.
 */
export async function mitTempVerzeichnis(fn) {
  const verzeichnis = mkdtempSync(join(tmpdir(), 'panel-test-'));
  try {
    return await fn(verzeichnis);
  } finally {
    rmSync(verzeichnis, { recursive: true, force: true });
  }
}
