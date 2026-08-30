/**
 * Gemeinsame Grundlage aller Ablagen.
 *
 * Die eine Regel, die hier durchgesetzt wird: Keine Ablagefunktion arbeitet
 * ohne Gilden-ID. Das Panel bedient heute einen Server, das Datenmodell kann
 * mehrere — und genau in dieser Uebergangszeit passieren die Fehler, bei denen
 * eine Abfrage versehentlich ueber alle Server laeuft.
 */

export class GildenFehler extends Error {
  constructor(wert) {
    super(
      'Diese Abfrage wurde ohne Gilden-ID aufgerufen. Jede Ablagefunktion ' +
        `verlangt sie als ersten Parameter (bekommen: ${JSON.stringify(wert)}).`,
    );
    this.name = 'GildenFehler';
  }
}

/**
 * @throws {GildenFehler} wenn die Gilden-ID fehlt oder keine Zeichenkette ist
 * @returns {string} die gepruefte Gilden-ID
 */
export function verlangtGildenId(guildId) {
  if (typeof guildId !== 'string' || guildId.trim() === '') throw new GildenFehler(guildId);
  return guildId;
}

/** Einheitlicher Zeitstempel fuer alle Ablagen. */
export function jetzt() {
  return new Date().toISOString();
}
