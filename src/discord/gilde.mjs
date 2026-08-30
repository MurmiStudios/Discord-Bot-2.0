import { ChannelType, PermissionFlagsBits } from 'discord.js';

/** Kanalarten, in die man schreiben kann — samt Namen fuer das Symbol im Panel. */
const SCHREIBBAR = new Map([
  [ChannelType.GuildText, 'text'],
  [ChannelType.GuildAnnouncement, 'ankuendigung'],
  [ChannelType.PublicThread, 'thread'],
  [ChannelType.PrivateThread, 'thread'],
  [ChannelType.AnnouncementThread, 'thread'],
]);

export const SPERRGRUND = Object.freeze({
  KEIN_SCHREIBRECHT: 'Der Bot darf in diesem Kanal nicht schreiben.',
  UEBER_BOT: 'Steht über der Rolle des Bots — Discord lässt ihn daran nicht rühren.',
  VERWALTET: 'Wird von einer Integration verwaltet und kann nicht vergeben werden.',
  KEIN_ROLLENRECHT: 'Dem Bot fehlt das Recht, Rollen zu verwalten.',
});

/**
 * Lesende Sicht auf den Server: Kanäle, Rollen, Mitglieder — in einer Form, die
 * das Panel direkt anzeigen kann.
 *
 * Hier endet discord.js. Alles jenseits dieses Moduls sieht nur noch schlichte
 * Objekte; deshalb ist alles jenseits davon auch ohne echten Server testbar.
 *
 * Ohne verbundenen Bot gibt jede Funktion eine leere Antwort statt zu
 * scheitern: Das Panel soll auch dann bedienbar bleiben und stattdessen in der
 * Kopfzeile sagen, dass der Bot fehlt.
 */
export function erstelleGildenAnsicht({ bot, konfig }) {
  const holeGilde = (guildId = konfig.guildId) => bot.gilde(guildId);

  function botDarfRollenVerwalten(gilde) {
    return Boolean(gilde.members.me?.permissions?.has(PermissionFlagsBits.ManageRoles));
  }

  return {
    verbunden: () => Boolean(holeGilde()),

    kanaele(guildId) {
      const gilde = holeGilde(guildId);
      if (!gilde) return [];

      const ich = gilde.members.me;
      const kanaele = [];

      for (const kanal of gilde.channels.cache.values()) {
        const art = SCHREIBBAR.get(kanal.type);
        if (!art) continue;

        const darfSchreiben = Boolean(
          kanal.permissionsFor(ich)?.has(PermissionFlagsBits.SendMessages),
        );
        const kategorie = kanal.parentId ? gilde.channels.cache.get(kanal.parentId) : null;

        kanaele.push({
          id: kanal.id,
          name: kanal.name,
          art,
          kategorieId: kanal.parentId ?? null,
          kategorieName: kategorie?.name ?? null,
          position: kanal.rawPosition ?? 0,
          darfSchreiben,
          sperrgrund: darfSchreiben ? null : SPERRGRUND.KEIN_SCHREIBRECHT,
        });
      }

      return kanaele.sort(
        (a, b) =>
          (a.kategorieName ?? '￿').localeCompare(b.kategorieName ?? '￿', 'de') ||
          a.position - b.position ||
          a.name.localeCompare(b.name, 'de'),
      );
    },

    rollen(guildId) {
      const gilde = holeGilde(guildId);
      if (!gilde) return [];

      const eigene = gilde.members.me?.roles?.highest;
      const darfRollen = botDarfRollenVerwalten(gilde);

      return [...gilde.roles.cache.values()]
        // Die eigene Rolle des Bots steht nicht zur Auswahl.
        .filter((rolle) => rolle.id !== eigene?.id && rolle.name !== '@everyone')
        .map((rolle) => {
          const ueberBot = rolle.position >= (eigene?.position ?? Infinity);
          const sperrgrund = !darfRollen
            ? SPERRGRUND.KEIN_ROLLENRECHT
            : rolle.managed
              ? SPERRGRUND.VERWALTET
              : ueberBot
                ? SPERRGRUND.UEBER_BOT
                : null;

          return {
            id: rolle.id,
            name: rolle.name,
            position: rolle.position,
            verwaltet: Boolean(rolle.managed),
            farbe: rolle.color ?? 0,
            vergebbar: sperrgrund === null,
            sperrgrund,
          };
        })
        .sort((a, b) => b.position - a.position || a.name.localeCompare(b.name, 'de'));
    },

    /**
     * @returns {string[]|undefined} Rollen-IDs, oder undefined wenn die Person
     * kein Mitglied ist. Der Unterschied ist wichtig: „keine Rollen" heisst
     * Mitglied ohne Zuordnung, „kein Mitglied" heisst gar kein Zugriff.
     */
    rollenVon(guildId, discordUserId) {
      const gilde = holeGilde(guildId);
      if (!gilde) return undefined;

      const mitglied = gilde.members.cache.get(discordUserId);
      if (!mitglied) return undefined;

      return [...mitglied.roles.cache.keys()];
    },

    sucheMitglieder(text, guildId) {
      const gilde = holeGilde(guildId);
      if (!gilde) return [];

      const suche = String(text ?? '').trim().toLowerCase();
      return [...gilde.members.cache.values()]
        .filter((m) => !m.user?.bot)
        .filter((m) => suche === '' || (m.displayName ?? '').toLowerCase().includes(suche))
        .map((m) => ({
          id: m.id,
          name: m.displayName,
          avatarUrl: m.user?.displayAvatarURL?.() ?? null,
          rollenIds: [...m.roles.cache.keys()],
        }))
        .sort((a, b) => a.name.localeCompare(b.name, 'de'));
    },

    findeKanal(kanalId, guildId) {
      return this.kanaele(guildId).find((k) => k.id === kanalId);
    },

    findeRolle(rollenId, guildId) {
      return this.rollen(guildId).find((r) => r.id === rollenId);
    },

    /** Rechte des Bots auf Serverebene. */
    botHatRecht(flagge, guildId) {
      const gilde = holeGilde(guildId);
      return Boolean(gilde?.members.me?.permissions?.has(flagge));
    },
  };
}
