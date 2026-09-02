import { GlobalFonts } from '@napi-rs/canvas';
import { fileURLToPath } from 'node:url';

/**
 * Die mitgelieferte Schrift registrieren.
 *
 * Auf einer frisch aufgesetzten Oracle-VM sind oft gar keine Schriften
 * installiert. Ohne diese Registrierung bestünde dort jedes erzeugte Bild aus
 * leeren Kästchen — und zwar erst im Betrieb, nicht in der Vorschau hier.
 *
 * Der Stapel nennt zusätzlich Systemschriften: Wo es sie gibt, füllen sie
 * Zeichen, die Liberation Sans nicht abdeckt (CJK, Emoji).
 */
export const SCHRIFTSTAPEL = '"Panel Sans", "DejaVu Sans", "Noto Sans", sans-serif';

const VERZEICHNIS = new URL('../../assets/fonts/', import.meta.url);

let registriert = false;

export function registriereSchriften() {
  if (registriert) return;

  for (const datei of ['LiberationSans-Regular.ttf', 'LiberationSans-Bold.ttf']) {
    GlobalFonts.registerFromPath(fileURLToPath(new URL(datei, VERZEICHNIS)), 'Panel Sans');
  }
  registriert = true;
}

/** Schriftangabe für den Canvas-Kontext. */
export function schriftFuer(groesse, fett = false) {
  return `${fett ? '700 ' : ''}${Math.round(groesse)}px ${SCHRIFTSTAPEL}`;
}
