/**
 * Wohin ein Platzhalter eingefügt wird.
 *
 * Ohne JavaScript kann die Seite nicht wissen, in welchem Feld die Schreibmarke
 * gerade steht. Deshalb sagt eine Zielwahl neben der Knopfreihe es ausdrücklich.
 * Mit JavaScript stellt `editor.js` sie automatisch auf das zuletzt benutzte
 * Feld — dieselbe Angabe, nur bequemer erhoben.
 *
 * Die Namen der Embed-Felder tragen ihren Index (`embedFeldWert:1`), weil es
 * mehrere davon gibt.
 */

const EINFACHE_ZIELE = new Map([
  ['text', { name: 'Text', ausEmbed: false }],
  ['embedTitel', { name: 'Embed: Titel', ausEmbed: true }],
  ['embedBeschreibung', { name: 'Embed: Beschreibung', ausEmbed: true }],
  ['embedFusszeile', { name: 'Embed: Fußzeile', ausEmbed: true }],
  ['embedAutor', { name: 'Embed: Autor', ausEmbed: true }],
]);

const FELD_ZIEL = /^(embedFeldName|embedFeldWert):(\d+)$/;

/** Die Ziele, die es bei diesem Entwurf tatsächlich gibt. */
export function moeglicheZiele(entwurf) {
  const ziele = [];

  for (const [wert, eintrag] of EINFACHE_ZIELE) {
    if (eintrag.ausEmbed && !entwurf.embedAn) continue;
    ziele.push({ wert, name: eintrag.name });
  }

  if (entwurf.embedAn) {
    entwurf.embed.felder.forEach((feld, i) => {
      const bezeichnung = feld.name.trim() === '' ? `Feld ${i + 1}` : feld.name.trim();
      ziele.push({ wert: `embedFeldName:${i}`, name: `Embed: ${bezeichnung} — Name` });
      ziele.push({ wert: `embedFeldWert:${i}`, name: `Embed: ${bezeichnung} — Wert` });
    });
  }

  return ziele;
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
