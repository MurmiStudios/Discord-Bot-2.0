/**
 * Das Verzeichnis der Aktionsarten.
 *
 * Eine Art dazuzunehmen heisst: eine Datei danebenlegen und sie hier
 * eintragen. Die Kette bleibt unberührt — sie schlägt nur nach.
 *
 * Jede Art erfüllt dieselbe Schnittstelle:
 *
 *     async fuehreAus(aktion, kontext)
 *       → { ok: true,  meldung?: string, werte?: object }
 *       → { ok: false, grund: string }
 *
 * `meldung` sieht nur der Klickende, `werte` stehen den folgenden Aktionen
 * desselben Knopfes zur Verfügung.
 */
export function erstelleArten(bausteine = {}) {
  const arten = new Map();
  for (const [name, art] of Object.entries(bausteine)) arten.set(name, art);
  return arten;
}
