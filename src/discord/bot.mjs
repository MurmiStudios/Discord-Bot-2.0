import { Client, GatewayIntentBits } from 'discord.js';

/**
 * Die Verbindung zu Discord — und die einzige Stelle, die einen echten Client
 * erzeugt. Alles andere bekommt ihn übergeben, damit es gegen ein Doppel
 * testbar bleibt.
 *
 * `GuildMembers` ist ein privilegierter Intent: Er muss im Entwicklerportal
 * unter Bot → Privileged Gateway Intents eingeschaltet sein. Ohne ihn kennt
 * das Panel keine Mitglieder und damit keine Rollen.
 */
function standardClient() {
  return new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
  });
}

const NOCH_NICHT = 'Der Bot hat sich noch nicht verbunden.';

export function erstelleBot({ konfig, logger, erzeugeClient = standardClient }) {
  const client = erzeugeClient();
  let zustand = { verbunden: false, grund: NOCH_NICHT, seit: undefined };

  const bereit = () => {
    zustand = { verbunden: true, grund: undefined, seit: new Date().toISOString() };
    logger.info('discord', 'Bot verbunden', { konto: client.user?.tag });
  };

  // discord.js 14 meldet `ready`, ab 15 `clientReady`. Beides annehmen kostet
  // nichts und erspart eine Ueberraschung beim naechsten Versionssprung.
  client.on('ready', bereit);
  client.on('clientReady', bereit);

  client.on('shardDisconnect', (ereignis) => {
    zustand = {
      verbunden: false,
      grund: 'Die Verbindung zu Discord ist abgerissen. Der Bot versucht, sie wieder aufzubauen.',
      seit: undefined,
    };
    logger.warn('discord', 'Verbindung abgerissen', { code: ereignis?.code });
  });

  client.on('shardResume', () => {
    bereit();
    logger.info('discord', 'Verbindung wieder aufgebaut');
  });

  // Ohne diesen Zuhoerer beendet ein Client-Fehler den ganzen Prozess.
  client.on('error', (fehler) => {
    logger.fehler('discord', 'Fehler vom Discord-Client', fehler);
  });

  return {
    client,

    async verbinde() {
      try {
        await client.login(konfig.token);
      } catch (fehler) {
        zustand = {
          verbunden: false,
          grund:
            'Discord hat den Bot-Token abgelehnt. Prüfe DISCORD_TOKEN in der .env — ' +
            'im Entwicklerportal unter Bot → Reset Token lässt sich ein neuer erzeugen.',
          seit: undefined,
        };
        logger.fehler('discord', 'Anmeldung des Bots gescheitert', fehler);
      }
    },

    status() {
      return { ...zustand };
    },

    /** Die Gilde aus dem Cache — nur solange der Bot verbunden ist. */
    gilde(guildId = konfig.guildId) {
      if (!zustand.verbunden) return undefined;
      return client.guilds.cache.get(guildId);
    },

    async beende() {
      await client.destroy();
      zustand = { verbunden: false, grund: 'Der Bot wurde beendet.', seit: undefined };
    },
  };
}
