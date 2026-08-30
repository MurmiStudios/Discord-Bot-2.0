/**
 * HTML zusammensetzen, ohne das Maskieren vergessen zu können.
 *
 * Der Grundgedanke: Maskieren ist die Vorgabe, „sicher" muss man ausdrücklich
 * sagen. Bei einer Template-Engine ist es meist andersherum — dort ist ein
 * vergessenes Escape eine Lücke, hier ein bewusstes `roh()`.
 *
 * Das ist auch der Grund, warum keine Template-Bibliothek dazukommt: Dieses
 * Verhalten ist wichtiger als die paar Bequemlichkeiten, und es sind
 * zwanzig Zeilen.
 */
class SichererText {
  constructor(wert) {
    this.wert = wert;
  }
  toString() {
    return this.wert;
  }
}

const ZEICHEN = new Map([
  ['&', '&amp;'],
  ['<', '&lt;'],
  ['>', '&gt;'],
  ['"', '&quot;'],
  ["'", '&#39;'],
]);

export function maskiere(wert) {
  return String(wert).replace(/[&<>"']/g, (zeichen) => ZEICHEN.get(zeichen));
}

/** Erklärt eine Zeichenkette ausdrücklich für sicher. Sparsam benutzen. */
export function roh(text) {
  return new SichererText(String(text));
}

export function istSicher(wert) {
  return wert instanceof SichererText;
}

function einsetzen(wert) {
  if (wert === null || wert === undefined || wert === false) return '';
  if (istSicher(wert)) return wert.wert;
  if (Array.isArray(wert)) return wert.map(einsetzen).join('');
  return maskiere(wert);
}

export function html(teile, ...werte) {
  let aus = teile[0];
  for (let i = 0; i < werte.length; i += 1) {
    aus += einsetzen(werte[i]) + teile[i + 1];
  }
  return new SichererText(aus);
}
