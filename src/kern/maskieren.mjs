/**
 * Geheimnisse aus Daten entfernen, bevor sie den Prozess verlassen.
 *
 * Zweifach: einmal die konkreten Werte, die bekannt sind (Token, Secrets), und
 * einmal nach Feldnamen — für alles, was jemand später mitgibt, ohne daran zu
 * denken. Wird von Logger und Protokoll benutzt; beides schreibt Daten an
 * Stellen, die jemand später liest.
 */

export const MASKE = '«maskiert»';

/** Kürzer würde harmlosen Text zerhacken. */
const KUERZESTES_GEHEIMNIS = 8;

/**
 * Feldnamen, deren Wert nie irgendwo landen darf, egal was drinsteht.
 *
 * Bewusst eng gefasst: Ein zu allgemeines Muster (etwa „kennung") maskiert
 * harmlose Kennungen mit und macht Protokolle unbrauchbar, ohne dass es
 * jemandem auffaellt.
 */
const HEIKLE_FELDER =
  /^(token|.*secret|.*passwor[dt]|authorization|autorisierung|cookie|sitzungskennung|sitzungsid|session(id)?|refresh_?token|access_?token)$/i;

const RINGMARKE = '«Ringbezug»';

/** Nur Geheimnisse ab einer Mindestlänge, längste zuerst. */
export function brauchbareGeheimnisse(geheimnisse = []) {
  return geheimnisse
    .filter((g) => typeof g === 'string' && g.length >= KUERZESTES_GEHEIMNIS)
    // Sonst maskiert ein Teilstueck das umgebende Geheimnis nur halb.
    .sort((a, b) => b.length - a.length);
}

export function maskiereText(text, geheimnisse) {
  let aus = text;
  for (const geheimnis of geheimnisse) aus = aus.split(geheimnis).join(MASKE);
  return aus;
}

function fehlerAlsObjekt(fehler) {
  return { name: fehler.name, meldung: fehler.message, stapel: fehler.stack };
}

export function saeubere(wert, geheimnisse = [], gesehen = new WeakSet()) {
  if (typeof wert === 'string') return maskiereText(wert, geheimnisse);
  if (wert === null || typeof wert !== 'object') return wert;
  if (wert instanceof Error) return saeubere(fehlerAlsObjekt(wert), geheimnisse, gesehen);

  if (gesehen.has(wert)) return RINGMARKE;
  gesehen.add(wert);

  if (Array.isArray(wert)) return wert.map((eintrag) => saeubere(eintrag, geheimnisse, gesehen));

  const aus = {};
  for (const [name, inhalt] of Object.entries(wert)) {
    aus[name] = HEIKLE_FELDER.test(name) ? MASKE : saeubere(inhalt, geheimnisse, gesehen);
  }
  return aus;
}
