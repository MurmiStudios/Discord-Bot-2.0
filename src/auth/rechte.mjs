import { STUFE, RANG, istStufe } from '../kern/stufen.mjs';

export { STUFE };

/**
 * Welche Zugriffsstufe hat dieses Konto — hier und jetzt?
 *
 * Bewusst eine reine Funktion ohne Datenbank und ohne Discord: Sie bekommt die
 * aktuellen Rollen uebergeben und wird bei *jeder* Anfrage neu aufgerufen.
 * Damit wirkt eine entzogene Rolle sofort, ohne dass sich jemand abmelden muss,
 * und es gibt keine gespeicherte Stufe, die veralten koennte.
 *
 * Die Vorgabe ist immer KEIN_ZUGRIFF. Jeder Zweifelsfall — kein Konto, keine
 * Mitgliedschaft, ein unbekannter Wert in der Tabelle — endet dort.
 */
export function bestimmeStufe({ discordUserId, ownerId, rollenIds, stufeFuerRollen }) {
  if (typeof discordUserId !== 'string' || discordUserId === '') return STUFE.KEIN_ZUGRIFF;

  // Der Owner haengt an der .env und nicht an einer Rolle. Deshalb kann eine
  // versehentlich entzogene Rolle ihn nicht aus seinem eigenen Panel aussperren.
  if (typeof ownerId === 'string' && ownerId !== '' && discordUserId === ownerId) {
    return STUFE.OWNER;
  }

  // `undefined` heisst: nicht Mitglied des Servers. Ein leeres Array heisst:
  // Mitglied ohne zugeordnete Rolle. Beides ergibt keinen Zugriff.
  if (!Array.isArray(rollenIds) || rollenIds.length === 0) return STUFE.KEIN_ZUGRIFF;

  const stufe = stufeFuerRollen(rollenIds);
  return istStufe(stufe) ? stufe : STUFE.KEIN_ZUGRIFF;
}

/** Reicht die vorhandene Stufe fuer die geforderte? Unbekanntes reicht nie. */
export function reichtAus(stufe, mindestens) {
  if (!istStufe(stufe) || !istStufe(mindestens)) return false;
  return RANG[stufe] >= RANG[mindestens];
}
