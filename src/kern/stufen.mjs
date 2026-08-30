/**
 * Die vier Zugriffsstufen. Gemeinsames Vokabular von Datenhaltung und
 * Rechtepruefung — deshalb liegt es im Kern und nicht in einem der beiden.
 */
export const STUFE = Object.freeze({
  OWNER: 'OWNER',
  MODERATOR: 'MODERATOR',
  BETRACHTER: 'BETRACHTER',
  KEIN_ZUGRIFF: 'KEIN_ZUGRIFF',
});

/** Hoeherer Rang schliesst den niedrigeren ein. */
export const RANG = Object.freeze({
  KEIN_ZUGRIFF: 0,
  BETRACHTER: 1,
  MODERATOR: 2,
  OWNER: 3,
});

export function istStufe(wert) {
  return Object.hasOwn(RANG, wert);
}

/** Gibt die hoehere der beiden Stufen zurueck. */
export function hoehere(a, b) {
  if (!istStufe(a)) return b;
  if (!istStufe(b)) return a;
  return RANG[a] >= RANG[b] ? a : b;
}
