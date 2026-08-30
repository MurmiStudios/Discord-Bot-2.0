import { PermissionFlagsBits } from 'discord.js';

export const AKTION = Object.freeze({
  KICKEN: 'kicken',
  ROLLE_VERGEBEN: 'rolle_vergeben',
  IN_KANAL_SCHREIBEN: 'in_kanal_schreiben',
});

const ERLAUBT = { erlaubt: true, grund: null };
const verboten = (grund) => ({ erlaubt: false, grund });

/**
 * Darf der Bot das — hier und jetzt?
 *
 * Diese Vorprüfung läuft an zwei Stellen: im Panel, damit dort *vorher* steht,
 * was nicht gehen wird, und noch einmal unmittelbar vor der Ausführung. Beides
 * ist nötig: Zwischen dem Einrichten einer Regel und ihrer Anwendung können
 * Monate liegen, und eine Rolle kann in der Zeit verschoben worden sein.
 */
export function darfBot(aktion, { ansicht, rollenId, kanalId }) {
  switch (aktion) {
    case AKTION.KICKEN: {
      if (!ansicht.botHatRecht(PermissionFlagsBits.KickMembers)) {
        return verboten(
          'Dem Bot fehlt das Recht, Mitglieder zu kicken. Es heißt in Discord ' +
            '„Mitglieder entfernen" und muss seiner Rolle gegeben werden.',
        );
      }
      return ERLAUBT;
    }

    case AKTION.ROLLE_VERGEBEN: {
      const rolle = ansicht.findeRolle(rollenId);
      if (!rolle) {
        return verboten('Diese Rolle gibt es auf dem Server nicht mehr.');
      }
      if (!rolle.vergebbar) return verboten(rolle.sperrgrund);
      return ERLAUBT;
    }

    case AKTION.IN_KANAL_SCHREIBEN: {
      const kanal = ansicht.findeKanal(kanalId);
      if (!kanal) {
        return verboten('Diesen Kanal gibt es auf dem Server nicht mehr.');
      }
      if (!kanal.darfSchreiben) return verboten(kanal.sperrgrund);
      return ERLAUBT;
    }

    default:
      return verboten(`Unbekannte Aktion: ${aktion}`);
  }
}
