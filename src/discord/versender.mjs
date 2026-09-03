import { alsDiscordNachricht } from '../nachricht/nutzlast.mjs';
import { platzhalterWerte } from '../nachricht/werte.mjs';

/**
 * Der eigentliche Versand an Discord.
 *
 * Die letzte Stelle vor Discord — und die einzige, die `send` aufruft. Fehler
 * werden hier nicht abgefangen: Die Warteschlange muss sie sehen, um zwischen
 * „Empfänger nimmt keine DMs an“ und „Discord bremst“ zu unterscheiden.
 *
 * Die Platzhalterwerte entstehen hier, weil sie je Empfänger andere sind. Der
 * Servername und die Mitgliederzahl kommen dabei aus dem Guild-Cache.
 */
export function erstelleVersender({ bot, konfig, gildenAnsicht, anhangBauer }) {
  function werteFuer(empfaenger, zusatz = {}) {
    const gilde = bot.gilde(konfig.guildId);
    // Der Versandvorgang kennt nur Kennung und Namen. Den Benutzernamen holt
    // deshalb der Guild-Cache — sonst stünde im Text der Anzeigename, im Bild
    // aber der echte, und das fiele erst dem Empfänger auf.
    const mitglied = gildenAnsicht?.findeMitglied?.(empfaenger?.id, konfig.guildId);

    return {
      ...platzhalterWerte({
        nutzer: { name: empfaenger?.name ?? mitglied?.name, tag: empfaenger?.tag ?? mitglied?.tag },
        gilde: gilde && { name: gilde.name, mitglieder: gilde.members?.cache?.size ?? 0 },
      }),
      ...zusatz,
    };
  }

  async function baueNutzlast(nachricht, empfaenger, zusatz) {
    // Je Empfänger ein eigenes Bild — das ist der Zweck der Bildvorlagen.
    const anhang = anhangBauer ? await anhangBauer.fuer(nachricht, empfaenger) : null;

    const nutzlast = alsDiscordNachricht(
      nachricht, werteFuer(empfaenger, zusatz), anhang ? [anhang] : [],
    );
    if (!nutzlast) {
      throw new Error('Die Nachricht hat keinen Inhalt — es gibt nichts zu senden.');
    }
    return nutzlast;
  }

  return {
    async sendeDm(empfaenger, nachricht, zusatz) {
      const nutzlast = await baueNutzlast(nachricht, empfaenger, zusatz);

      if (!bot.status().verbunden) {
        throw new Error('Der Bot ist nicht mit Discord verbunden.');
      }

      const nutzer = await bot.client.users.fetch(empfaenger.id);
      return nutzer.send(nutzlast);
    },

    async sendeInKanal(kanalId, nachricht, zusatz) {
      // Kein Empfänger: In einem Kanal gibt es keinen. Eine Bildvorlage wird
      // dann mit Servernamen und Mitgliederzahl gefüllt, {user} bleibt leer —
      // sichtbar schon in der Vorschau, bevor jemand auf Senden drückt.
      const nutzlast = await baueNutzlast(nachricht, null, zusatz);

      const gilde = bot.gilde(konfig.guildId);
      if (!gilde) throw new Error('Der Bot ist nicht mit Discord verbunden.');

      const kanal = gilde.channels.cache.get(kanalId);
      if (!kanal) {
        throw Object.assign(new Error('Unknown Channel'), { code: 10003 });
      }
      return kanal.send(nutzlast);
    },
  };
}
