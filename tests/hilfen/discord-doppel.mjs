import { EventEmitter } from 'node:events';
import { ChannelType, PermissionFlagsBits } from 'discord.js';

/**
 * Erfundener Discord-Server samt Client.
 *
 * Bildet genau die Lesefläche nach, die `src/discord/` benutzt — Collections
 * sind einfache Maps, weil discord.js-Collections von Map erben und nur deren
 * Methoden verwendet werden. Alles andere bleibt bewusst weg: Ein Doppel, das
 * discord.js vollständig nachbaut, testet am Ende sich selbst.
 */

export const KANALART = {
  TEXT: ChannelType.GuildText,
  ANKUENDIGUNG: ChannelType.GuildAnnouncement,
  THREAD: ChannelType.PublicThread,
  SPRACHE: ChannelType.GuildVoice,
  KATEGORIE: ChannelType.GuildCategory,
};

/**
 * Echte discord.js-Flaggen statt eigener Zeichenketten: Sonst wuerde das Doppel
 * an der Bibliothek vorbei testen und ein Tippfehler im Flaggennamen faende
 * sich erst im Betrieb.
 */
export const RECHT = {
  NACHRICHTEN_SENDEN: PermissionFlagsBits.SendMessages,
  KANAL_SEHEN: PermissionFlagsBits.ViewChannel,
  MITGLIEDER_KICKEN: PermissionFlagsBits.KickMembers,
  ROLLEN_VERWALTEN: PermissionFlagsBits.ManageRoles,
};

function rechte(gewaehrt) {
  const menge = new Set(gewaehrt);
  return { has: (flagge) => menge.has(flagge) };
}

export function erstelleClientDoppel({
  guildId = '111111111111111111',
  gildenName = 'Testserver',
  botRolleposition = 10,
  botRechte = [RECHT.KANAL_SEHEN, RECHT.NACHRICHTEN_SENDEN, RECHT.ROLLEN_VERWALTEN],
  rollen = [],
  kanaele = [],
  mitglieder = [],
  anmeldungScheitert = false,
  dmFehler = {},
  kanalFehler = {},
} = {}) {
  const client = new EventEmitter();
  client.zerstoert = false;
  client.angemeldetMit = undefined;

  const rollenMap = new Map();
  // Die Bot-Rolle selbst ist immer dabei; sie legt die Hierarchiegrenze fest.
  rollenMap.set('bot-rolle', {
    id: 'bot-rolle',
    name: 'Panel-Bot',
    position: botRolleposition,
    managed: true,
    color: 0,
  });
  for (const rolle of rollen) {
    rollenMap.set(rolle.id, {
      id: rolle.id,
      name: rolle.name,
      position: rolle.position ?? 1,
      managed: rolle.managed ?? false,
      color: rolle.color ?? 0,
    });
  }

  const mitgliederMap = new Map();
  for (const m of mitglieder) {
    mitgliederMap.set(m.id, {
      id: m.id,
      displayName: m.name ?? m.id,
      user: { id: m.id, username: m.name ?? m.id, bot: m.bot ?? false, displayAvatarURL: () => `https://cdn.discordapp.com/avatars/${m.id}/x.png` },
      roles: { cache: new Map((m.rollen ?? []).map((r) => [r, rollenMap.get(r) ?? { id: r, name: r, position: 1 }])) },
    });
  }

  const ich = {
    id: 'bot-konto',
    displayName: 'Panel-Bot',
    permissions: rechte(botRechte),
    roles: { highest: rollenMap.get('bot-rolle') },
  };

  // Was tatsaechlich verschickt wurde — die Testzusicherung haengt daran.
  const gesendet = [];

  const kanaeleMap = new Map();
  for (const k of kanaele) {
    kanaeleMap.set(k.id, {
      id: k.id,
      name: k.name,
      type: k.type ?? KANALART.TEXT,
      parentId: k.parentId ?? null,
      rawPosition: k.position ?? 0,
      permissionsFor: () => rechte(k.botDarf ?? botRechte),
      async send(nutzlast) {
        if (kanalFehler[k.id]) throw kanalFehler[k.id];
        gesendet.push({ art: 'kanal', ziel: k.id, nutzlast });
        return { id: 'nachricht-1' };
      },
    });
  }

  const gilde = {
    id: guildId,
    name: gildenName,
    roles: { cache: rollenMap },
    channels: { cache: kanaeleMap },
    members: {
      cache: mitgliederMap,
      me: ich,
      async fetch(id) {
        if (id === undefined) return mitgliederMap;
        const gefunden = mitgliederMap.get(id);
        if (!gefunden) throw Object.assign(new Error('Unknown Member'), { code: 10007 });
        return gefunden;
      },
    },
  };

  client.guilds = { cache: new Map([[guildId, gilde]]) };
  client.user = { id: 'bot-konto', tag: 'Panel-Bot#0001' };

  client.users = {
    async fetch(id) {
      const mitglied = mitgliederMap.get(id);
      if (!mitglied) throw Object.assign(new Error('Unknown User'), { code: 10013 });
      return {
        id,
        async send(nutzlast) {
          if (dmFehler[id]) throw dmFehler[id];
          gesendet.push({ art: 'dm', ziel: id, nutzlast });
          return { id: 'nachricht-1' };
        },
      };
    },
  };

  client.login = async (token) => {
    client.angemeldetMit = token;
    if (anmeldungScheitert) {
      const fehler = new Error('An invalid token was provided.');
      fehler.code = 'TokenInvalid';
      throw fehler;
    }
    // discord.js meldet erst nach dem Login bereit — hier gleich im naechsten Zug.
    queueMicrotask(() => client.emit('clientReady', client));
    return token;
  };
  client.destroy = async () => {
    client.zerstoert = true;
  };

  return { client, gilde, rollenMap, kanaeleMap, mitgliederMap, gesendet };
}
