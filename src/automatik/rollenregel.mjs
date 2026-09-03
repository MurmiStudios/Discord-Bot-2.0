import { SPERRGRUND } from '../discord/gilde.mjs';
import { klartext } from '../discord/fehler.mjs';
import { GRUPPE, ERGEBNIS } from '../protokoll/protokoll.mjs';

/**
 * Ob eine Rolle sich entziehen lässt — und wenn nicht, warum.
 *
 * Drei Gründe, und alle drei kann man erst zur Laufzeit kennen:
 *
 * - Über der Bot-Rolle: Discord lässt einen Bot keine Rolle anfassen, die in
 *   der Hierarchie über seiner eigenen steht.
 * - Von einer Integration verwaltet: Rollen von Bots, Boosts oder
 *   Abonnements vergibt Discord selbst.
 * - Der Auslöser selbst: „Wer X erhält, verliert X“ ist keine Regel, sondern
 *   ein Widerspruch.
 *
 * Die Prüfung steht bewusst hier und nicht nur in der Seite: Sie wird beim
 * Speichern *und* beim Anwenden gebraucht. Zwischen beiden können Monate
 * liegen, und eine Rolle kann in der Zwischenzeit nach oben gerutscht sein.
 */
export const SPERRE_AUSLOESER = 'Das ist die Auslöserrolle selbst.';

export function pruefeEntzug(rolle, ausloeserId) {
  if (!rolle) {
    return { erlaubt: false, grund: 'Diese Rolle gibt es auf dem Server nicht mehr.' };
  }
  if (rolle.id === ausloeserId) {
    return { erlaubt: false, grund: SPERRE_AUSLOESER };
  }
  if (!rolle.vergebbar) {
    return { erlaubt: false, grund: rolle.sperrgrund ?? SPERRGRUND.KEIN_ROLLENRECHT };
  }
  return { erlaubt: true, grund: null };
}

/**
 * Die Regeln anwenden.
 *
 * Geprüft wird hier ein zweites Mal, obwohl die Seite beim Speichern schon
 * geprüft hat. Zwischen beiden können Monate liegen: Eine Rolle kann inzwischen
 * über die Bot-Rolle gerutscht sein, von einer Integration übernommen worden
 * sein, oder es gibt sie gar nicht mehr. Dann wird sie übersprungen und der
 * Grund protokolliert — der Rest der Regel läuft weiter.
 *
 * Ein Fehlschlag beim Entziehen bricht ebenfalls nichts ab. Drei Rollen
 * wegzunehmen und an der zweiten hängenzubleiben wäre der unangenehmste
 * Ausgang: halb angewendet, und niemand weiss welche Hälfte.
 */
export function erstelleRollenregelAutomatik({
  rollenregeln, gildenAnsicht, rollenVerwalter, protokoll, logger, konfig,
}) {
  async function wendeAn(mitglied, ausloeserId) {
    const guildId = konfig.guildId;
    const regel = rollenregeln.fuerAusloeser(guildId, ausloeserId);
    if (!regel?.aktiv || regel.entzug.length === 0) return { entzogen: 0, uebersprungen: 0 };

    const ausloeser = gildenAnsicht.findeRolle(ausloeserId, guildId);
    const ausloeserName = ausloeser?.name ?? ausloeserId;

    let entzogen = 0;
    let uebersprungen = 0;

    for (const rollenId of regel.entzug) {
      // Wer die Rolle gar nicht hat, dem kann sie nicht genommen werden.
      if (!mitglied.rollenIds?.includes(rollenId)) continue;

      const rolle = gildenAnsicht.findeRolle(rollenId, guildId);
      const urteil = pruefeEntzug(rolle, ausloeserId);

      if (!urteil.erlaubt) {
        uebersprungen += 1;
        protokoll.schreibe(guildId, {
          art: 'rollenregel.uebersprungen',
          gruppe: GRUPPE.ROLLEN,
          ergebnis: ERGEBNIS.FEHLER,
          akteur: mitglied,
          betreff: rolle?.name ?? rollenId,
          klartext:
            `„${rolle?.name ?? rollenId}“ konnte nicht entzogen werden: ${urteil.grund} ` +
            `(Regel: wer „${ausloeserName}“ erhält)`,
        });
        logger.warn('automatik', 'Rolle übersprungen', {
          mitglied: mitglied.id, rolle: rollenId, grund: urteil.grund,
        });
        continue;
      }

      try {
        await rollenVerwalter.entziehe(
          mitglied.id, rollenId, `Rollenregel: erhielt „${ausloeserName}“`,
        );
        entzogen += 1;

        protokoll.schreibe(guildId, {
          art: 'rollenregel.entzogen',
          gruppe: GRUPPE.ROLLEN,
          ergebnis: ERGEBNIS.ERFOLG,
          akteur: mitglied,
          betreff: rolle.name,
          klartext: `„${rolle.name}“ entzogen, weil „${ausloeserName}“ dazukam.`,
        });
      } catch (fehler) {
        uebersprungen += 1;
        const grund = klartext(fehler);

        protokoll.schreibe(guildId, {
          art: 'rollenregel.fehlgeschlagen',
          gruppe: GRUPPE.ROLLEN,
          ergebnis: ERGEBNIS.FEHLER,
          akteur: mitglied,
          betreff: rolle.name,
          klartext: `„${rolle.name}“ konnte nicht entzogen werden: ${grund}`,
        });
        logger.warn('automatik', 'Rolle nicht entzogen', {
          mitglied: mitglied.id, rolle: rollenId, grund,
        });
      }
    }

    return { entzogen, uebersprungen };
  }

  return {
    /** @returns {Promise<{entzogen: number, uebersprungen: number}>} */
    async beiRollenerhalt(mitglied, hinzugekommen) {
      let entzogen = 0;
      let uebersprungen = 0;

      for (const ausloeserId of hinzugekommen) {
        const ergebnis = await wendeAn(mitglied, ausloeserId);
        entzogen += ergebnis.entzogen;
        uebersprungen += ergebnis.uebersprungen;
      }

      return { entzogen, uebersprungen };
    },
  };
}
