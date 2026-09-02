import { alsDiscordNachricht } from '../nachricht/nutzlast.mjs';

/**
 * Der eigentliche Versand an Discord.
 *
 * Die letzte Stelle vor Discord — und die einzige, die `send` aufruft. Fehler
 * werden hier nicht abgefangen: Die Warteschlange muss sie sehen, um zwischen
 * „Empfänger nimmt keine DMs an" und „Discord bremst" zu unterscheiden.
 *
 * Die Platzhalterwerte entstehen hier, weil sie je Empfänger andere sind. Der
 * Servername und die Mitgliederzahl kommen dabei aus dem Guild-Cache.
 */
export function erstelleVersender({ bot, konfig }) {
  function werteFuer(empfaenger, zusatz = {}) {
    const gilde = bot.gilde(konfig.guildId);
    return {
      user: empfaenger?.name ?? '',
      tag: empfaenger?.tag ?? empfaenger?.name ?? '',
      guild: gilde?.name ?? '',
      count: gilde?.members?.cache?.size ?? 0,
      role: '',
      ...zusatz,
    };
  }

  function baueNutzlast(nachricht, empfaenger, zusatz) {
    const nutzlast = alsDiscordNachricht(nachricht, werteFuer(empfaenger, zusatz));
    if (!nutzlast) {
      throw new Error('Die Nachricht hat keinen Inhalt — es gibt nichts zu senden.');
    }
    return nutzlast;
  }

  return {
    async sendeDm(empfaenger, nachricht, zusatz) {
      const nutzlast = baueNutzlast(nachricht, empfaenger, zusatz);

      if (!bot.status().verbunden) {
        throw new Error('Der Bot ist nicht mit Discord verbunden.');
      }

      const nutzer = await bot.client.users.fetch(empfaenger.id);
      return nutzer.send(nutzlast);
    },

    async sendeInKanal(kanalId, nachricht, zusatz) {
      const nutzlast = baueNutzlast(nachricht, null, zusatz);

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
