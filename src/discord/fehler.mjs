/**
 * Discord-Fehlercodes in Sätze übersetzen, die jemandem etwas sagen.
 *
 * „Fehler 50007" beantwortet keine Frage. „Empfänger nimmt keine
 * Direktnachrichten von Servermitgliedern an" sagt, dass niemand etwas falsch
 * gemacht hat und dass es auch beim nächsten Versuch nicht klappen wird.
 */
const TEXTE = new Map([
  [
    50007,
    'Empfänger nimmt keine Direktnachrichten von Servermitgliedern an. ' +
      'Das ist eine Einstellung im Discord-Konto der Person; von hier aus lässt sie sich nicht umgehen.',
  ],
  [
    50013,
    'Dem Bot fehlt das nötige Recht. Prüfe seine Rolle auf dem Server — und ob sie ' +
      'hoch genug steht, um die betroffene Rolle zu vergeben.',
  ],
  [
    50001,
    'Der Bot hat auf diesen Kanal keinen Zugriff. Meist fehlt ihm das Recht, ihn überhaupt zu sehen.',
  ],
  [10003, 'Diesen Kanal gibt es nicht mehr. Vermutlich wurde er gelöscht oder umgezogen.'],
  [10011, 'Diese Rolle gibt es nicht mehr. Vermutlich wurde sie gelöscht.'],
  [10013, 'Dieses Konto gibt es nicht mehr, oder die Person hat den Server verlassen.'],
  [10007, 'Diese Person ist kein Mitglied des Servers (mehr).'],
  [
    40003,
    'Discord bremst gerade: Es wurden zu schnell zu viele Anfragen gestellt. ' +
      'Der Versand macht eine kurze Pause und läuft dann weiter.',
  ],
  [
    30007,
    'Discord lässt keine weiteren Webhooks in diesem Kanal zu.',
  ],
]);

/** Netzwerkabbrüche, die beim nächsten Versuch verschwunden sein können. */
const VORUEBERGEHENDE_CODES = new Set(['ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', 'EAI_AGAIN', 'UND_ERR_CONNECT_TIMEOUT']);

export function klartext(fehler) {
  if (!fehler) return 'Unbekannter Fehler ohne nähere Angabe.';

  const bekannt = TEXTE.get(fehler.code);
  if (bekannt) return bekannt;

  if (VORUEBERGEHENDE_CODES.has(fehler.code)) {
    return 'Die Verbindung zu Discord ist abgerissen. Beim nächsten Versuch kann es schon wieder gehen.';
  }

  // Der Code steht mit im Satz — er hilft beim Nachschlagen, wenn hier einmal
  // etwas auftaucht, das noch keine Übersetzung hat.
  const nachtrag = fehler.code === undefined ? '' : ` (Discord-Code ${fehler.code})`;
  const meldung = fehler.message ? ` ${fehler.message}` : '';
  return `Discord hat den Vorgang abgelehnt${nachtrag}.${meldung}`.trim();
}

/** Lohnt ein späterer Versuch? Nur dann pausiert der Versand statt abzubrechen. */
export function istVoruebergehend(fehler) {
  if (!fehler) return false;
  return fehler.code === 40003 || VORUEBERGEHENDE_CODES.has(fehler.code);
}
