import { entwurfAus, alsNachricht } from '../../nachricht/entwurf.mjs';
import { istLeer } from '../../nachricht/modell.mjs';
import { klartext } from '../../discord/fehler.mjs';
import { GRUPPE, ERGEBNIS } from '../../protokoll/protokoll.mjs';

/**
 * Aktionsart: Der Knopf schickt eine gespeicherte Nachricht als Direktnachricht.
 *
 * Der Knopf trägt keinen eigenen Text, sondern nur die Kennung einer Nachricht
 * aus der Ablage. Das ist der Grund, warum es die Ablage gibt: Wer den Text
 * ändert, ändert ihn an einer Stelle — und nicht in jeder Leiste, in der er
 * einmal gelandet ist.
 *
 * Damit kommen Bildvorlagen und Platzhalter gratis mit: Der Versender kennt
 * beide schon, und die Aktion ruft denselben Weg auf wie das Panel.
 */

export const ART = 'dm';

export function erstelleDmAktion({ nachrichtenAblage, versender, protokoll, logger, konfig }) {
  return {
    async fuehreAus(aktion, kontext = {}) {
      const mitglied = kontext.mitglied;
      if (!mitglied?.id) {
        return { ok: false, grund: 'Zu diesem Klick liess sich kein Mitglied bestimmen.' };
      }

      const kennung = Number(aktion?.nachrichtId);
      const eintrag = Number.isInteger(kennung)
        ? nachrichtenAblage.lies(konfig.guildId, kennung)
        : undefined;

      // Eine Leiste kann Monate älter sein als der Stand der Ablage. Deshalb
      // ein klarer Grund statt eines Absturzes — und einer, der sagt, wer ihn
      // beheben kann.
      if (!eintrag || eintrag.beschaedigt) {
        return {
          ok: false,
          grund: 'Die Nachricht, die dieser Knopf verschickt, gibt es nicht mehr. '
            + 'Wer das Panel betreibt, muss die Aktionsleiste anpassen.',
        };
      }

      const nachricht = alsNachricht(entwurfAus(eintrag.daten));
      if (istLeer(nachricht)) {
        return {
          ok: false,
          grund: `Die Nachricht „${eintrag.name}“ hat keinen Inhalt — es gibt nichts zu senden.`,
        };
      }

      try {
        // Die Werte aus vorherigen Aktionen gehen als Platzhalter mit: So
        // landet die Antwort aus einem Eingabefenster in dieser Nachricht.
        await versender.sendeDm(mitglied, nachricht, kontext.werte ?? {});
      } catch (fehler) {
        logger.warn('aktion', 'Direktnachricht nicht zugestellt', {
          mitglied: mitglied.id, nachricht: eintrag.id, grund: klartext(fehler),
        });
        return { ok: false, grund: klartext(fehler) };
      }

      protokoll.schreibe(konfig.guildId, {
        art: 'aktion.dm',
        gruppe: GRUPPE.NACHRICHTEN,
        ergebnis: ERGEBNIS.ERFOLG,
        akteur: mitglied,
        betreff: eintrag.name,
        klartext: `„${eintrag.name}“ als Direktnachricht zugestellt.`,
      });

      return { ok: true, meldung: 'Schau in deine Direktnachrichten.' };
    },
  };
}
