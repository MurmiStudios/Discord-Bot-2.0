/**
 * Rollen geben und wegnehmen — die einzige Stelle, die das tut.
 *
 * Wie `versender.mjs` für Nachrichten: die letzte Stelle vor Discord. Fehler
 * werden hier nicht abgefangen, sondern nach oben gereicht; nur der Aufrufer
 * weiss, ob ein Fehlschlag protokolliert oder gemeldet gehört.
 */
export function erstelleRollenVerwalter({ bot, konfig }) {
  return {
    /**
     * @param {string} userId
     * @param {string} rollenId
     * @param {string} [grund] taucht im Discord-Prüfprotokoll auf
     */
    async entziehe(userId, rollenId, grund) {
      return (await hole(userId)).roles.remove(rollenId, grund);
    },

    /**
     * @param {string} userId
     * @param {string} rollenId
     * @param {string} [grund] taucht im Discord-Prüfprotokoll auf
     */
    async vergib(userId, rollenId, grund) {
      return (await hole(userId)).roles.add(rollenId, grund);
    },
  };

  async function hole(userId) {
    const gilde = bot.gilde(konfig.guildId);
    if (!gilde) throw new Error('Der Bot ist nicht mit Discord verbunden.');
    return gilde.members.fetch(userId);
  }
}
