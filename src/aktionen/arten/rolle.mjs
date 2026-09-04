import { klartext } from '../../discord/fehler.mjs';
import { GRUPPE, ERGEBNIS } from '../../protokoll/protokoll.mjs';

/**
 * Aktionsart: Der Knopf gibt eine Rolle — oder nimmt sie weg.
 *
 * Geprüft wird hier ein zweites Mal, obwohl die Seite beim Speichern schon
 * geprüft hat. Genau wie bei den Rollenregeln: Zwischen Speichern und Klicken
 * können Monate liegen, und eine Rolle kann in der Zwischenzeit über die
 * Bot-Rolle gerutscht sein. Ein Knopf, der dann kommentarlos nichts täte, wäre
 * schlimmer als einer, der sagt, was ihm fehlt.
 *
 * Der Rollenname geht als `{role}` an die folgenden Aktionen: So schickt eine
 * Kette „Rolle geben → Nachricht senden“ eine Nachricht, die die Rolle beim
 * Namen nennt, ohne dass er zweimal getippt wird.
 */

export const ART = 'rolle';

const GEBEN = 'geben';

export function erstelleRollenAktion({
  gildenAnsicht, rollenVerwalter, protokoll, logger, konfig,
}) {
  return {
    async fuehreAus(aktion, kontext = {}) {
      const mitglied = kontext.mitglied;
      if (!mitglied?.id) {
        return { ok: false, grund: 'Zu diesem Klick liess sich kein Mitglied bestimmen.' };
      }

      const gibt = String(aktion?.richtung ?? GEBEN) === GEBEN;
      const rolle = gildenAnsicht.findeRolle(String(aktion?.rolleId ?? ''), konfig.guildId);

      if (!rolle) {
        return {
          ok: false,
          grund: 'Die Rolle, die dieser Knopf vergibt, gibt es auf dem Server nicht mehr. '
            + 'Wer das Panel betreibt, muss die Aktionsleiste anpassen.',
        };
      }
      if (!rolle.vergebbar) {
        return { ok: false, grund: `„${rolle.name}“ — ${rolle.sperrgrund}` };
      }

      // Discord nimmt beides klaglos zweimal an. Trotzdem hier abgefangen: Die
      // Rueckmeldung an den Klickenden soll stimmen, und ein „gegeben“ im
      // Protokoll, bei dem sich nichts geaendert hat, ist eine Falschaussage.
      const hat = Array.isArray(mitglied.rollenIds)
        ? mitglied.rollenIds.includes(rolle.id)
        : null;
      if (hat === gibt) {
        return {
          ok: true,
          meldung: gibt ? `Du hast „${rolle.name}“ bereits.` : `Du hattest „${rolle.name}“ nicht.`,
          werte: { role: rolle.name },
        };
      }

      const grundText = `Aktionsleiste: ${kontext.knopf ?? 'Knopfdruck'}`;

      try {
        if (gibt) await rollenVerwalter.vergib(mitglied.id, rolle.id, grundText);
        else await rollenVerwalter.entziehe(mitglied.id, rolle.id, grundText);
      } catch (fehler) {
        logger.warn('aktion', 'Rolle nicht geändert', {
          mitglied: mitglied.id, rolle: rolle.id, richtung: gibt ? GEBEN : 'nehmen',
          grund: klartext(fehler),
        });
        return { ok: false, grund: klartext(fehler) };
      }

      protokoll.schreibe(konfig.guildId, {
        art: gibt ? 'aktion.rolle.gegeben' : 'aktion.rolle.entzogen',
        gruppe: GRUPPE.ROLLEN,
        ergebnis: ERGEBNIS.ERFOLG,
        akteur: mitglied,
        betreff: rolle.name,
        klartext: gibt
          ? `„${rolle.name}“ per Knopfdruck gegeben.`
          : `„${rolle.name}“ per Knopfdruck entzogen.`,
      });

      return {
        ok: true,
        meldung: gibt ? `Du hast jetzt „${rolle.name}“.` : `„${rolle.name}“ ist weg.`,
        werte: { role: rolle.name },
      };
    },
  };
}
