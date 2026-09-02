/**
 * Zeitpunkte für die Anzeige.
 *
 * In der Datenbank steht ISO 8601 in UTC — richtig für Sortierung und
 * Vergleiche, aber nichts, was jemand lesen möchte. Hier wird daraus die
 * deutsche Schreibweise in der Zeitzone des Servers: Wer das Panel betreibt,
 * hat die Zeitzone seiner Maschine gesetzt und erwartet die Uhrzeit, die er
 * kennt.
 *
 * Ein unlesbarer Wert wird durchgereicht statt ersetzt: Ein sichtbar seltsamer
 * Zeitstempel ist besser als ein erfundener.
 */
const FORMAT = new Intl.DateTimeFormat('de-DE', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

export function alsZeitpunkt(iso) {
  if (!iso) return '';

  const zeit = new Date(iso);
  if (Number.isNaN(zeit.getTime())) return String(iso);

  return `${FORMAT.format(zeit)} Uhr`;
}
