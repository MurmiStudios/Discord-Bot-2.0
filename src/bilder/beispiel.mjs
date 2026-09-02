import { createCanvas } from '@napi-rs/canvas';
import { registriereSchriften, schriftFuer } from './schrift.mjs';
import { beispielWerte } from '../nachricht/platzhalter.mjs';

/**
 * Ein erfundenes Profilbild für die Vorschau.
 *
 * Gezeichnet statt mitgeliefert: Es ist eine Datei weniger im Repository, und
 * niemand muss sich fragen, wessen Gesicht da eigentlich abgebildet ist.
 */
export function beispielAvatar(groesse = 256) {
  registriereSchriften();

  const leinwand = createCanvas(groesse, groesse);
  const stift = leinwand.getContext('2d');

  const verlauf = stift.createLinearGradient(0, 0, groesse, groesse);
  verlauf.addColorStop(0, '#5865f2');
  verlauf.addColorStop(1, '#8f5cf7');
  stift.fillStyle = verlauf;
  stift.fillRect(0, 0, groesse, groesse);

  stift.fillStyle = '#ffffff';
  stift.font = schriftFuer(Math.round(groesse * 0.42), true);
  stift.textAlign = 'center';
  stift.textBaseline = 'middle';
  stift.fillText('AB', groesse / 2, groesse / 2);

  return leinwand.toBuffer('image/png');
}

/** Die Daten, mit denen die Vorschau eine Vorlage füllt. */
export function beispielDaten() {
  return { ...beispielWerte(), avatarBild: beispielAvatar() };
}
