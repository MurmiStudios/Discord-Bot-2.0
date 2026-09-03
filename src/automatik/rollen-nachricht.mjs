import { entwurfAus, alsNachricht } from '../nachricht/entwurf.mjs';
import { istLeer } from '../nachricht/modell.mjs';
import { klartext } from '../discord/fehler.mjs';
import { GRUPPE, ERGEBNIS } from '../protokoll/protokoll.mjs';

/**
 * Was passiert, wenn jemand eine Rolle bekommt.
 *
 * Nur *hinzugekommene* Rollen lösen aus. Discord meldet jede Änderung am
 * Mitglied — Namenswechsel, Zeitsperre, entzogene Rolle — als dasselbe
 * Ereignis. Ohne den Vergleich von vorher und nachher bekäme jemand seine
 * Willkommensnachricht für „Verifiziert“ ein zweites Mal, nur weil er den
 * Spitznamen geändert hat.
 *
 * Bekommt jemand zwei Rollen auf einmal, löst jede ihre eigene Nachricht aus.
 * Das ist gewollt: Es sind zwei Dinge, die ihm zugesprochen wurden.
 */
export function erstelleRollenAutomatik({
  rollenNachrichten, gildenAnsicht, versender, protokoll, logger, konfig,
}) {
  async function verschicke(mitglied, rollenId) {
    const guildId = konfig.guildId;
    const eintrag = rollenNachrichten.fuerRolle(guildId, rollenId);
    if (!eintrag.aktiv) return { gesendet: false, grund: null };

    const nachricht = alsNachricht(entwurfAus(eintrag.daten));
    if (istLeer(nachricht)) return { gesendet: false, grund: null };

    const rolle = gildenAnsicht.findeRolle(rollenId, guildId);
    const rollenName = rolle?.name ?? rollenId;

    try {
      // Der Rollenname geht als {role} mit — dafür ist der Platzhalter da.
      await versender.sendeDm(mitglied, nachricht, { role: rollenName });

      protokoll.schreibe(guildId, {
        art: 'rollennachricht.gesendet',
        gruppe: GRUPPE.NACHRICHTEN,
        ergebnis: ERGEBNIS.ERFOLG,
        akteur: mitglied,
        betreff: rollenName,
        klartext: `Rollen-Nachricht für „${rollenName}“ zugestellt.`,
      });
      return { gesendet: true, grund: null };
    } catch (fehler) {
      const grund = klartext(fehler);

      protokoll.schreibe(guildId, {
        art: 'rollennachricht.fehlgeschlagen',
        gruppe: GRUPPE.NACHRICHTEN,
        ergebnis: ERGEBNIS.FEHLER,
        akteur: mitglied,
        betreff: rollenName,
        klartext: `Rollen-Nachricht für „${rollenName}“ nicht zugestellt: ${grund}`,
      });
      logger.warn('automatik', 'Rollen-Nachricht nicht zugestellt', {
        mitglied: mitglied.id, rolle: rollenId, grund,
      });
      return { gesendet: false, grund };
    }
  }

  return {
    /**
     * @param {{id, name, tag}} mitglied
     * @param {string[]} hinzugekommen  nur die neuen Rollen
     * @returns {Promise<{gesendet: number}>}
     */
    async beiRollenerhalt(mitglied, hinzugekommen) {
      let gesendet = 0;

      // Nacheinander, nicht gleichzeitig: Zwei Direktnachrichten im selben
      // Augenblick sind genau das, was Discord bremst.
      for (const rollenId of hinzugekommen) {
        const ergebnis = await verschicke(mitglied, rollenId);
        if (ergebnis.gesendet) gesendet += 1;
      }

      return { gesendet };
    },
  };
}
