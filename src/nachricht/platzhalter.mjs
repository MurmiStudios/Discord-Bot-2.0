/**
 * Platzhalter in Nachrichtentexten.
 *
 * Zwei Entscheidungen, die im Betrieb zählen:
 *
 * - Ein unbekannter Platzhalter bleibt stehen, statt zu verschwinden. Wer sich
 *   bei `{usr}` vertippt, sieht das in der Vorschau. Verschwände er, fiele der
 *   Fehler erst dem Empfänger auf — und die Nachricht wäre schon raus.
 * - Ersetzt wird in einem Durchgang. Ein eingesetzter Wert, der selbst wie ein
 *   Platzhalter aussieht, wird nicht erneut durchsucht; sonst könnte ein
 *   Anzeigename bestimmen, welcher Text in der Nachricht landet.
 */

export const PLATZHALTER = Object.freeze([
  { name: '{user}', erklaerung: 'Anzeigename der Person' },
  { name: '{tag}', erklaerung: 'Discord-Benutzername (ohne @)' },
  { name: '{guild}', erklaerung: 'Name des Servers' },
  { name: '{role}', erklaerung: 'Name der auslösenden Rolle' },
  { name: '{count}', erklaerung: 'Anzahl der Mitglieder auf dem Server' },
]);

/** `{{user}}` schreibt den Platzhalter als Text, `{user}` ersetzt ihn. */
const MUSTER = /\{\{([a-z_]+)\}\}|\{([a-z_]+)\}/gi;

export function ersetze(text, werte = {}) {
  if (text === null || text === undefined) return '';

  return String(text).replace(MUSTER, (ganzes, geschuetzt, name) => {
    // Doppelte Klammern: Der Platzhalter soll sichtbar bleiben.
    if (geschuetzt !== undefined) return `{${geschuetzt}}`;

    const wert = werte[name.toLowerCase()];
    return wert === undefined || wert === null ? ganzes : String(wert);
  });
}

/** Beispieldaten für die Vorschau. Deckt jeden Platzhalter ab. */
export function beispielWerte() {
  return {
    user: 'Anna Beispiel',
    tag: 'anna_beispiel',
    guild: 'Mein Server',
    role: 'Verifiziert',
    count: 128,
  };
}
