/**
 * Wohin ein Platzhalter eingefügt wird.
 *
 * Jede Variablen-Reihe steht unter ihrem Feld und trägt dessen Namen im Wert
 * ihrer Knöpfe. Die Namen der Embed-Felder tragen zusätzlich ihren Index
 * (`embedFeldWert:1`), weil es mehrere davon gibt.
 */

const EINFACHE_ZIELE = new Map([
  ['text', { ausEmbed: false }],
  ['embedTitel', { ausEmbed: true }],
  ['embedBeschreibung', { ausEmbed: true }],
  ['embedFusszeile', { ausEmbed: true }],
  ['embedAutor', { ausEmbed: true }],
]);

const FELD_ZIEL = /^(embedFeldName|embedFeldWert):(\d+)$/;

/**
 * Zerlegt den Wert eines Variablen-Knopfes: `embedTitel|{user}`.
 *
 * Ziel und Variable stecken im selben Wert, weil der Browser beim Absenden nur
 * den geklickten Knopf mitschickt. Damit braucht die Seite keinen Zustand
 * darüber, welches Feld gerade gemeint ist.
 */
export function zerlegeKnopfwert(wert) {
  const roh = String(wert ?? '');
  const trenner = roh.indexOf('|');
  if (trenner < 1) return null;
  return { ziel: roh.slice(0, trenner), platzhalter: roh.slice(trenner + 1) };
}

/**
 * Hängt den Platzhalter an das gewählte Ziel an.
 *
 * Ein Ziel, das es nicht gibt, wird verworfen — es wird *nicht* auf den Text
 * ausgewichen. Sonst landet der Platzhalter irgendwo, wo ihn niemand erwartet,
 * und das fällt erst nach dem Senden auf.
 *
 * @returns {boolean} ob eingefügt wurde
 */
export function fuegeEin(entwurf, ziel, platzhalter) {
  const gewaehlt = String(ziel ?? 'text');

  if (EINFACHE_ZIELE.has(gewaehlt)) {
    const eintrag = EINFACHE_ZIELE.get(gewaehlt);
    if (eintrag.ausEmbed && !entwurf.embedAn) return false;

    if (gewaehlt === 'text') entwurf.text += platzhalter;
    else entwurf.embed[embedSchluessel(gewaehlt)] += platzhalter;
    return true;
  }

  const treffer = FELD_ZIEL.exec(gewaehlt);
  if (!treffer || !entwurf.embedAn) return false;

  const index = Number(treffer[2]);
  const feld = entwurf.embed.felder[index];
  if (!feld) return false;

  if (treffer[1] === 'embedFeldName') feld.name += platzhalter;
  else feld.wert += platzhalter;
  return true;
}

function embedSchluessel(ziel) {
  return { embedTitel: 'titel', embedBeschreibung: 'beschreibung', embedFusszeile: 'fusszeile', embedAutor: 'autor' }[
    ziel
  ];
}
