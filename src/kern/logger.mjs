/**
 * Strukturierter Logger mit Geheimnis-Maskierung.
 *
 * Der Logger ist eine von zwei Stellen, an denen beliebige Daten den Prozess
 * verlassen (die andere ist das Protokoll). Das Maskieren liegt deshalb in
 * `kern/maskieren.mjs` und wird von beiden benutzt — eine Regel, zwei Nutzer.
 */
import { saeubere, brauchbareGeheimnisse, maskiereText } from './maskieren.mjs';

export function erstelleLogger({ geheimnisse = [], schreibe } = {}) {
  const echteGeheimnisse = brauchbareGeheimnisse(geheimnisse);

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
