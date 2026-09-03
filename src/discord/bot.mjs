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
  let zustand = {
    verbunden: false, grund: NOCH_NICHT, seit: undefined,
    mitglieder: null, mitgliederGrund: null,
  };

  const bereit = () => {
    zustand = {
      ...zustand,
      verbunden: true,
      grund: undefined,
      seit: new Date().toISOString(),
    };
    logger.info('discord', 'Bot verbunden', { konto: client.user?.tag });

    // Bewusst ohne await: Der Zuhoerer soll nicht warten. Fehler faengt
    // `ladeMitglieder` selbst ab.
    ladeMitglieder();
  };

  /**
   * Die Mitgliederliste einmal holen.
   *
   * Der Grund, warum das hier stehen muss: Discord schickt sie nicht von
   * selbst. Der Intent `GuildMembers` *erlaubt* das Abrufen, er erledigt es
   * nicht — der Cache enthaelt sonst nur den Bot und wen man zufaellig in einem
   * Ereignis gesehen hat. Genau so sah es auf dem ersten echten Server aus:
   * Rollen da, Mitglieder leer.
   *
   * Ohne die Liste findet die Empfaengersuche niemanden, kein Profilbild kommt
   * ins Bild, und eine Rollenaenderung meldet Discord ohne den Stand davor.
   */
  async function ladeMitglieder() {
    const gilde = client.guilds.cache.get(konfig.guildId);

    if (!gilde) {
      zustand = {
        ...zustand,
        mitglieder: null,
        mitgliederGrund:
          `Der Bot ist nicht auf dem Server ${konfig.guildId}. Lade ihn ein — ` +
          'oder prüfe GUILD_ID in der .env.',
      };
      logger.warn('discord', 'Gilde nicht gefunden', { guildId: konfig.guildId });
      return;
    }

    try {
      const geladen = await gilde.members.fetch();
      zustand = { ...zustand, mitglieder: geladen.size, mitgliederGrund: null };
      logger.info('discord', 'Mitglieder geladen', { anzahl: geladen.size });
    } catch (fehler) {
      zustand = {
        ...zustand,
        mitglieder: null,
        mitgliederGrund:
          'Die Mitgliederliste liess sich nicht laden. Meist fehlt der ' +
          '„Server Members Intent“ im Entwicklerportal unter Bot → Privileged ' +
          'Gateway Intents. Ohne sie findet die Empfängersuche niemanden.',
      };
      logger.fehler('discord', 'Mitgliederliste nicht geladen', fehler);
    }
  }

  // Nur `clientReady`, nicht `ready`.
  //
  // discord.js sendet beide — erst das alte `ready`, dann `clientReady`. Wer
  // auf beide horcht, bekommt alles doppelt; und allein die Tatsache, dass ein
  // Zuhoerer auf `ready` haengt, laesst discord.js eine Verfallswarnung
  // ausgeben. Genau so stand es zuerst hier, und genau so sah es auf dem
  // ersten echten Server aus.
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
