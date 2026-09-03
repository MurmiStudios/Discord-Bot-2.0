/**
 * Das Nachrichtenmodell und die Grenzen, die Discord setzt.
 *
 * Die Zahlen stehen hier an einer Stelle, weil sie an drei Orten gebraucht
 * werden: beim Prüfen vor dem Senden, beim Zähler im Editor und in der
 * Vorschau. Auseinanderlaufen dürfen sie nicht.
 */
export const GRENZE = Object.freeze({
  TEXT: 2000,
  EMBED_GESAMT: 6000,
  TITEL: 256,
  BESCHREIBUNG: 4096,
  FUSSZEILE: 2048,
  AUTOR: 256,
  FELDER: 25,
  FELD_NAME: 256,
  FELD_WERT: 1024,
});

export const ART = Object.freeze({ DM: 'dm', KANAL: 'kanal' });

export function leeresEmbed() {
  return { titel: '', beschreibung: '', fusszeile: '', autor: '', farbe: null, felder: [] };
}

/**
 * Discord rechnet Titel, Beschreibung, alle Feldnamen und -werte, Fusszeile und
 * Autor gegen ein gemeinsames Limit von 6000. Genau so wird hier gezählt —
 * sonst meldet das Panel „passt“ und Discord lehnt danach ab.
 */
export function embedZeichen(embed) {
  if (!embed) return 0;

  const laenge = (wert) => String(wert ?? '').length;
  const felder = (embed.felder ?? []).reduce(
    (summe, feld) => summe + laenge(feld.name) + laenge(feld.wert),
    0,
  );

  return (
    laenge(embed.titel) +
    laenge(embed.beschreibung) +
    laenge(embed.fusszeile) +
    laenge(embed.autor) +
    felder
  );
}

/** Ein Embed ohne jeden Inhalt ist kein Inhalt. */
export function embedHatInhalt(embed) {
  return embedZeichen(embed) > 0;
}

/**
 * Eine Nachricht ohne Text, ohne Embed und ohne Bild wäre eine Nachricht, die
 * nichts sagt. Discord nimmt sie nicht einmal an.
 */
export function istLeer(nachricht) {
  const text = String(nachricht?.text ?? '').trim();
  if (text !== '') return false;
  if (embedHatInhalt(nachricht?.embed)) return false;
  if (nachricht?.bildvorlageId) return false;
  return true;
}

export function leereNachricht(art = ART.DM) {
  return {
    name: '',
    art,
    text: '',
    embed: null,
    bildvorlageId: null,
    aktionsleisteId: null,
  };
}
