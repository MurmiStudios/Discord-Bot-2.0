import { entwurfAus, alsNachricht } from '../nachricht/entwurf.mjs';
import { istLeer } from '../nachricht/modell.mjs';
import { klartext } from '../discord/fehler.mjs';
import { GRUPPE, ERGEBNIS } from '../protokoll/protokoll.mjs';

/**
 * Was beim Beitritt passiert.
 *
 * Zwei Dinge, die hier bewusst so sind:
 *
 * - Auch ohne aktive Willkommensnachricht wird der Beitritt protokolliert.
 *   Sonst sähe man später eine Lücke und wüsste nicht, ob niemand beigetreten
 *   ist oder ob etwas nicht funktioniert hat.
 * - Ein Fehlschlag wird protokolliert und geschluckt, nicht geworfen. Der
 *   Aufrufer ist ein Discord-Ereignis; eine Ausnahme dort beendet im
 *   ungünstigen Fall den ganzen Prozess. Wer keine Direktnachrichten annimmt,
 *   ist kein Grund, den Bot anzuhalten.
 */
export function erstelleWillkommensAutomatik({ willkommen, versender, protokoll, logger, konfig }) {
  return {
    /**
     * @param {{id: string, name: string, tag?: string}} mitglied
     * @returns {Promise<{gesendet: boolean, grund: ?string}>}
     */
    async beiBeitritt(mitglied) {
      const guildId = konfig.guildId;
      const stand = willkommen.lies(guildId);
      const nachricht = alsNachricht(entwurfAus(stand.daten));

      if (!stand.aktiv || istLeer(nachricht)) {
        protokoll.schreibe(guildId, {
          art: 'beitritt',
          gruppe: GRUPPE.SONSTIGES,
          ergebnis: ERGEBNIS.ERFOLG,
          akteur: mitglied,
          betreff: mitglied.name,
          klartext: stand.aktiv
            ? 'Beigetreten — die Willkommensnachricht ist aktiv, aber leer.'
            : 'Beigetreten — keine Willkommensnachricht aktiv.',
        });
        return { gesendet: false, grund: null };
      }

      try {
        await versender.sendeDm(mitglied, nachricht);

        protokoll.schreibe(guildId, {
          art: 'willkommen.gesendet',
          gruppe: GRUPPE.NACHRICHTEN,
          ergebnis: ERGEBNIS.ERFOLG,
          akteur: mitglied,
          betreff: mitglied.name,
          klartext: 'Willkommensnachricht zugestellt.',
        });
        return { gesendet: true, grund: null };
      } catch (fehler) {
        const grund = klartext(fehler);

        protokoll.schreibe(guildId, {
          art: 'willkommen.fehlgeschlagen',
          gruppe: GRUPPE.NACHRICHTEN,
          ergebnis: ERGEBNIS.FEHLER,
          akteur: mitglied,
          betreff: mitglied.name,
          klartext: `Willkommensnachricht nicht zugestellt: ${grund}`,
        });
        logger.warn('automatik', 'Willkommensnachricht nicht zugestellt', {
          mitglied: mitglied.id, grund,
        });
        return { gesendet: false, grund };
      }
    },
  };
}
