import { REST, Routes } from 'discord.js';

/**
 * Meldet die Slash-Befehle bei Discord an.
 *
 * Heute gibt es keine — `befehle/` ist leer. Der Weg dorthin existiert
 * trotzdem: Wenn später ein Befehl dazukommt, ist er eine Datei und kein Umbau.
 * Ein leerer Lauf meldet nichts an, statt Discord eine leere Liste zu schicken.
 *
 * Scheitert die Anmeldung, startet das Panel trotzdem: Ohne Slash-Befehle ist
 * es vollständig bedienbar, und ein Ausfall bei Discord soll den Webserver
 * nicht mitnehmen.
 */
export async function registriereBefehle({ befehle, konfig, logger, anmelden = standardAnmelden(konfig) }) {
  if (befehle.size === 0) {
    logger.info('interaktion', 'Keine Slash-Befehle vorhanden — nichts anzumelden');
    return;
  }

  const daten = [...befehle.values()].map((befehl) => befehl.daten);
  try {
    await anmelden(daten);
    logger.info('interaktion', 'Slash-Befehle angemeldet', { anzahl: daten.length });
  } catch (fehler) {
    logger.fehler('interaktion', 'Anmelden der Slash-Befehle gescheitert', fehler);
  }
}

function standardAnmelden(konfig) {
  return async (daten) => {
    const rest = new REST({ version: '10' }).setToken(konfig.token);
    await rest.put(Routes.applicationGuildCommands(konfig.clientId, konfig.guildId), { body: daten });
  };
}

/** Lädt die Befehle aus dem Verzeichnis. Heute leer — und das ist in Ordnung. */
export async function ladeBefehle(verzeichnis) {
  const { readdirSync } = await import('node:fs');
  const { existsSync } = await import('node:fs');
  if (!existsSync(verzeichnis)) return new Map();

  const befehle = new Map();
  for (const datei of readdirSync(verzeichnis)) {
    if (!datei.endsWith('.mjs')) continue;
    const modul = await import(new URL(datei, verzeichnis).href);
    if (modul.daten?.name && typeof modul.ausfuehren === 'function') {
      befehle.set(modul.daten.name, { daten: modul.daten, ausfuehren: modul.ausfuehren });
    }
  }
  return befehle;
}
