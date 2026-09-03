import { SPERRGRUND } from '../discord/gilde.mjs';

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
