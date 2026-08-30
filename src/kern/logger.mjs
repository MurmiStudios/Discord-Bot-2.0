/**
 * Strukturierter Logger mit Geheimnis-Maskierung.
 *
 * Der Logger ist die einzige Stelle, an der beliebige Daten den Prozess
 * verlassen. Deshalb maskiert er zweifach: einmal die konkreten Werte, die er
 * beim Erzeugen bekommen hat (Token, Secrets), und einmal nach Feldnamen — fuer
 * alles, was jemand spaeter mitgibt, ohne daran zu denken.
 */

const MASKE = '«maskiert»';

/** Kuerzer wuerde harmlosen Text zerhacken. */
const KUERZESTES_GEHEIMNIS = 8;

/** Feldnamen, deren Wert nie in der Ausgabe stehen darf, egal was drinsteht. */
const HEIKLE_FELDER =
  /^(token|.*secret|.*passwor[dt]|authorization|autorisierung|cookie|sitzung(s)?id|session(id)?|refresh_?token|access_?token)$/i;

/** Verhindert, dass ein Ringbezug den Logger in eine Endlosschleife schickt. */
const RINGMARKE = '«Ringbezug»';

function maskiereText(text, geheimnisse) {
  let aus = text;
  for (const geheimnis of geheimnisse) aus = aus.split(geheimnis).join(MASKE);
  return aus;
}

function fehlerAlsObjekt(fehler) {
  return { name: fehler.name, meldung: fehler.message, stapel: fehler.stack };
}

function saeubere(wert, geheimnisse, gesehen) {
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

/**
 * @param {object} optionen
 * @param {Array<string|undefined|null>} [optionen.geheimnisse] Werte, die nie ausgegeben werden duerfen
 * @param {(zeile: string) => void} [optionen.schreibe] Ausgabeziel, vorgabegemaess stdout
 */
export function erstelleLogger({ geheimnisse = [], schreibe } = {}) {
  const echteGeheimnisse = geheimnisse
    .filter((g) => typeof g === 'string' && g.length >= KUERZESTES_GEHEIMNIS)
    // Laengste zuerst: sonst maskiert ein Teilstueck das umgebende Geheimnis nur halb.
    .sort((a, b) => b.length - a.length);

  const ausgeben = schreibe ?? ((zeile) => process.stdout.write(`${zeile}\n`));

  function zeile(stufe, bereich, meldung, daten) {
    const eintrag = {
      zeit: new Date().toISOString(),
      stufe,
      bereich,
      meldung: maskiereText(String(meldung), echteGeheimnisse),
    };
    if (daten !== undefined) {
      eintrag.daten = saeubere(daten, echteGeheimnisse, new WeakSet());
    }
    ausgeben(JSON.stringify(eintrag));
  }

  return {
    info: (bereich, meldung, daten) => zeile('info', bereich, meldung, daten),
    warn: (bereich, meldung, daten) => zeile('warn', bereich, meldung, daten),
    fehler: (bereich, meldung, daten) => zeile('fehler', bereich, meldung, daten),
  };
}
