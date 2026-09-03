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

/** Wie lange dasselbe Ereignis als Wiederholung gilt. */
export const SPERRFENSTER_MS = 10_000;

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

/**
 * Die Sperre gegen dasselbe Ereignis zweimal.
 *
 * Der Vergleich von vorher und nachher fängt nur ab, was Discord als
 * *Änderung* meldet. Er hilft nicht, wenn dieselbe Änderung ein zweites Mal
 * ankommt: Das Gateway spielt nach einem Verbindungsabriss verpasste
 * Ereignisse nach, und zwei laufende Bot-Prozesse sehen ohnehin jeder alles.
 * Beides endet in zwei Direktnachrichten für einen Beitritt — und das merkt
 * nicht der Betreiber, sondern der Empfänger.
 *
 * Bewusst im Arbeitsspeicher und mit kurzem Fenster: Es geht um Wiederholungen
 * im Sekundenbereich. Wer eine Rolle wegnimmt und eine Minute später wieder
 * vergibt, meint es und bekommt seine Nachricht.
 *
 * Der Zeitgeber ist einsetzbar, damit ein Test nicht warten muss.
 */
export function erstelleSperre({ fenster = SPERRFENSTER_MS, jetzt = () => Date.now() } = {}) {
  const gesehen = new Map();

  return {
    /** @returns {boolean} true, wenn genau das gerade schon durchgelaufen ist */
    wiederholung(schluessel) {
      const zeit = jetzt();

      // Aufräumen beim Vorbeigehen: Ohne das wüchse die Karte mit jedem
      // Mitglied, das dem Server je beigetreten ist.
      for (const [k, wann] of gesehen) {
        if (zeit - wann > fenster) gesehen.delete(k);
      }

      // Nur beim ersten Mal merken. Sonst schöbe jede Wiederholung das Fenster
      // weiter, und ein Dauerfeuer käme nie wieder durch.
      if (gesehen.has(schluessel)) return true;
      gesehen.set(schluessel, zeit);
      return false;
    },
  };
}

export function registriereEreignisse(
  client, { konfig, logger, beiBeitritt, beiRollenerhalt, fenster, jetzt },
) {
  const sperre = erstelleSperre({ fenster, jetzt });

  client.on('guildMemberAdd', (roh) => {
    if (roh?.guild?.id !== konfig.guildId) return;

    const mitglied = alsMitglied(roh);
    // Bots begrüsst niemand, und Discord nimmt ihre Direktnachrichten nicht an.
    if (mitglied.istBot) return;

    if (sperre.wiederholung(`beitritt:${mitglied.id}`)) {
      logger.warn('automatik', 'Beitritt doppelt gemeldet — übersprungen', {
        mitglied: mitglied.id,
      });
      return;
    }

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

    const frisch = hinzugekommen.filter((rollenId) => {
      if (!sperre.wiederholung(`rolle:${mitglied.id}:${rollenId}`)) return true;
      logger.warn('automatik', 'Rollenerhalt doppelt gemeldet — übersprungen', {
        mitglied: mitglied.id, rolle: rollenId,
      });
      return false;
    });
    if (frisch.length === 0) return;

    Promise.resolve(beiRollenerhalt?.(mitglied, frisch)).catch((fehler) => {
      logger.fehler('automatik', 'Rollenänderung konnte nicht verarbeitet werden', fehler);
    });
  });
}
