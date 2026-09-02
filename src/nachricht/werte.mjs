/**
 * Die Werte hinter den Platzhaltern — an einer Stelle.
 *
 * Drei Wege brauchen sie: die Vorschau im Nachrichteneditor, die Vorschau einer
 * Bildvorlage und der Versand selbst. Stünden sie dreimal da, zeigte die
 * Vorschau irgendwann etwas anderes als das, was ankommt — und genau das ist
 * der Fehler, den eine Vorschau verhindern soll.
 */
export function platzhalterWerte({ nutzer, gilde, rolle } = {}) {
  return {
    user: nutzer?.name ?? '',
    // Ohne eigenen Benutzernamen ist der Anzeigename die ehrlichste Auskunft.
    tag: nutzer?.tag ?? nutzer?.name ?? '',
    guild: gilde?.name ?? '',
    count: gilde?.mitglieder ?? 0,
    role: rolle ?? '',
  };
}
