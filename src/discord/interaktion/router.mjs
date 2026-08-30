import { MessageFlags } from 'discord.js';

/**
 * Verteiler für alles, was aus Discord zurückkommt.
 *
 * Drei Spuren, weil Discord drei Dinge über denselben Kanal liefert:
 * Knopfdrücke, ausgefüllte Eingabefenster und Slash-Befehle. Die dritte Spur
 * ist heute leer — sie ist die offene Tür für später, und offen ist sie nur,
 * weil sie von Anfang an mitverdrahtet wurde.
 *
 * Knopf- und Fenster-Kennungen haben die Form `bereich:id`; verteilt wird nach
 * dem Bereich vor dem Doppelpunkt.
 */
export function erstelleRouter({ logger, buttons = new Map(), modals = new Map(), befehle = new Map() }) {
  const bereichVon = (customId) => String(customId ?? '').split(':')[0];

  async function antworteLeise(interaktion, text) {
    // ephemeral: Die Meldung sieht nur die Person, die geklickt hat.
    const inhalt = { content: text, flags: MessageFlags.Ephemeral, ephemeral: true };
    if (interaktion.replied || interaktion.deferred) return interaktion.followUp(inhalt);
    return interaktion.reply(inhalt);
  }

  async function fuehreAus(umgang, interaktion, beschreibung) {
    try {
      await umgang(interaktion);
    } catch (fehler) {
      logger.fehler('interaktion', `Umgang gescheitert: ${beschreibung}`, fehler);
      await antworteLeise(
        interaktion,
        'Das ist schiefgegangen und konnte nicht ausgeführt werden. ' +
          'Wer das Panel betreibt, findet den Grund im Protokoll.',
      ).catch(() => {});
    }
  }

  async function verarbeite(interaktion) {
    if (interaktion.isButton?.()) {
      const umgang = buttons.get(bereichVon(interaktion.customId));
      if (!umgang) return unbekannt(interaktion, 'Knopf');
      return fuehreAus(umgang, interaktion, interaktion.customId);
    }

    if (interaktion.isModalSubmit?.()) {
      const umgang = modals.get(bereichVon(interaktion.customId));
      if (!umgang) return unbekannt(interaktion, 'Eingabefenster');
      return fuehreAus(umgang, interaktion, interaktion.customId);
    }

    if (interaktion.isChatInputCommand?.()) {
      const befehl = befehle.get(interaktion.commandName);
      if (!befehl) return unbekannt(interaktion, 'Befehl');
      return fuehreAus((i) => befehl.ausfuehren(i), interaktion, interaktion.commandName);
    }

    // Alles andere geht uns nichts an — kein Grund, etwas zu tun.
    return undefined;
  }

  async function unbekannt(interaktion, was) {
    logger.warn('interaktion', `Unbekannter ${was}`, {
      kennung: interaktion.customId ?? interaktion.commandName,
    });
    await antworteLeise(
      interaktion,
      'Dieser Knopf gehört zu etwas, das es nicht mehr gibt. ' +
        'Vermutlich wurde die Aktionsleiste inzwischen geändert oder gelöscht.',
    ).catch(() => {});
  }

  return {
    verarbeite,
    registriereAn(client) {
      client.on('interactionCreate', verarbeite);
    },
  };
}
