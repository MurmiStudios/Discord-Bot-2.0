import { GRUPPE, ERGEBNIS } from '../protokoll/protokoll.mjs';

/**
 * Die Ausführungskette eines Knopfes.
 *
 * Sie kennt keine einzelne Aktionsart. Jede Art ist eine Einheit mit derselben
 * Schnittstelle, und die Kette schlägt sie in einem Verzeichnis nach — sonst
 * müsste sie bei jeder neuen Art angefasst werden, und genau dort schleichen
 * sich die Fehler ein.
 *
 * Bei einem Fehler bricht sie ab, statt weiterzulaufen. Wer eine Kette
 * „Rolle geben → Bestätigung schicken“ baut, will nicht die Bestätigung ohne
 * die Rolle. Halb ausgeführt und nichts davon gesagt ist der schlechteste
 * Ausgang.
 *
 * Was eine Aktion an Werten zurückgibt, steht den folgenden zur Verfügung —
 * so kommt in Schritt 50 die Antwort aus einem Eingabefenster in die
 * nachfolgende Direktnachricht.
 */

/** Eine Aktionsart erfüllt genau das hier. */
export const SCHNITTSTELLE = Object.freeze(['fuehreAus']);

export class KettenFehler extends Error {
  constructor(meldung) {
    super(meldung);
    this.name = 'KettenFehler';
  }
}

/**
 * @param {Map<string, {fuehreAus: Function}>} arten
 */
export function erstelleKette({ arten, protokoll, logger, konfig }) {
  return {
    /**
     * @param {{beschriftung?: string, aktionen: {art: string}[]}} knopf
     * @param {object} kontext  mindestens `{ mitglied }`; wächst während des Laufs
     * @returns {Promise<{ok: boolean, meldungen: string[], grund: ?string, gelaufen: number}>}
     */
    async fuehreAus(knopf, kontext = {}) {
      const aktionen = knopf?.aktionen ?? [];
      const meldungen = [];
      const werte = { ...(kontext.werte ?? {}) };
      let gelaufen = 0;

      for (const aktion of aktionen) {
        const art = arten.get(aktion?.art);

        if (!art) {
          // Kann im Betrieb nur vorkommen, wenn eine gespeicherte Leiste eine
          // Art nennt, die es nicht mehr gibt. Dann ist Abbrechen richtig:
          // Weiterlaufen hiesse, einen Teil der Absicht stillschweigend
          // wegzulassen.
          return abbruch(
            `Diese Aktion („${aktion?.art ?? 'ohne Art'}“) kennt das Panel nicht. ` +
              'Sie stammt vermutlich aus einer älteren Fassung.',
          );
        }

        let ergebnis;
        try {
          // Eine Kopie: Sonst hielte jede Aktion dasselbe Objekt in der Hand
          // und könnte den Stand der Kette hinter deren Rücken verändern.
          ergebnis = await art.fuehreAus(aktion, { ...kontext, werte: { ...werte } });
        } catch (fehler) {
          logger.fehler('aktion', 'Aktion abgebrochen', fehler);
          return abbruch(fehler instanceof KettenFehler ? fehler.message : 'Da ist etwas schiefgegangen.');
        }

        if (!ergebnis?.ok) {
          return abbruch(ergebnis?.grund ?? 'Die Aktion konnte nicht ausgeführt werden.');
        }

        gelaufen += 1;
        if (ergebnis.meldung) meldungen.push(ergebnis.meldung);
        Object.assign(werte, ergebnis.werte ?? {});
      }

      return { ok: true, meldungen, grund: null, gelaufen };

      function abbruch(grund) {
        protokoll.schreibe(konfig.guildId, {
          art: 'aktion.abgebrochen',
          gruppe: GRUPPE.SONSTIGES,
          ergebnis: ERGEBNIS.FEHLER,
          akteur: kontext.mitglied,
          betreff: knopf?.beschriftung ?? null,
          klartext: `Aktion ${gelaufen + 1} von ${aktionen.length} scheiterte: ${grund}`,
        });

        return { ok: false, meldungen, grund, gelaufen };
      }
    },
  };
}
