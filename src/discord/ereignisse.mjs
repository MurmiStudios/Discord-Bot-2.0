/**
 * Die Ereignisse, auf die der Bot hört.
 *
 * Hier endet discord.js zum zweiten Mal — wie in `gilde.mjs`, nur für die
 * andere Richtung. Aus einem GuildMember wird ein schlichtes Objekt, und die
 * Automatiken dahinter kennen discord.js nicht.
 *
 * Ereignisse eines anderen Servers werden verworfen. Das Panel bedient heute
 * einen, das Datenmodell kann mehrere — aber solange nur einer eingerichtet
 * ist, hat ein fremder Beitritt hier nichts verloren.
 */

/** GuildMember → das, was die Automatiken brauchen. */
export function alsMitglied(mitglied) {
  return {
    id: mitglied.id,
    name: mitglied.displayName ?? mitglied.user?.username ?? mitglied.id,
    tag: mitglied.user?.username ?? mitglied.displayName ?? mitglied.id,
    istBot: Boolean(mitglied.user?.bot),
    rollenIds: [...(mitglied.roles?.cache?.keys?.() ?? [])],
  };
}

/**
 * Welche Rollen zwischen zwei Ständen dazugekommen sind.
 *
 * Discord meldet jede Änderung am Mitglied als dasselbe Ereignis — auch einen
 * Namenswechsel. Ohne diesen Vergleich löste jede davon die Rollen-Nachrichten
 * erneut aus.
 */
export function neueRollen(vorher, nachher) {
  const alt = new Set(vorher ?? []);
  return (nachher ?? []).filter((id) => !alt.has(id));
}

export function registriereEreignisse(
  client, { konfig, logger, beiBeitritt, beiRollenerhalt },
) {
  client.on('guildMemberAdd', (roh) => {
    if (roh?.guild?.id !== konfig.guildId) return;

    const mitglied = alsMitglied(roh);
    // Bots begrüsst niemand, und Discord nimmt ihre Direktnachrichten nicht an.
    if (mitglied.istBot) return;

    // Kein await: Ein Ereignis-Zuhörer soll nicht warten. Fehler fängt die
    // Automatik selbst ab — hier bleibt nur das letzte Netz.
    Promise.resolve(beiBeitritt?.(mitglied)).catch((fehler) => {
      logger.fehler('automatik', 'Beitritt konnte nicht verarbeitet werden', fehler);
    });
  });

  client.on('guildMemberUpdate', (vorher, nachher) => {
    if (nachher?.guild?.id !== konfig.guildId) return;

    const mitglied = alsMitglied(nachher);
    if (mitglied.istBot) return;

    const hinzugekommen = neueRollen(alsMitglied(vorher).rollenIds, mitglied.rollenIds);
    if (hinzugekommen.length === 0) return;

    Promise.resolve(beiRollenerhalt?.(mitglied, hinzugekommen)).catch((fehler) => {
      logger.fehler('automatik', 'Rollenänderung konnte nicht verarbeitet werden', fehler);
    });
  });
}
