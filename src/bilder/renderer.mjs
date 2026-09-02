import { createCanvas, loadImage } from '@napi-rs/canvas';
import { registriereSchriften, schriftFuer } from './schrift.mjs';
import { ersetze } from '../nachricht/platzhalter.mjs';

/** Die vorgegebenen Formate. „eigen" nimmt Breite und Höhe aus der Vorlage. */
export const FORMATE = Object.freeze({
  breit: { breite: 1200, hoehe: 400 },
  quadratisch: { breite: 600, hoehe: 600 },
  banner: { breite: 1200, hoehe: 300 },
});

const GRENZEN = { minKante: 1, maxKante: 4096, minSchrift: 8 };

export function standardVorlage() {
  return {
    format: 'breit',
    breite: FORMATE.breit.breite,
    hoehe: FORMATE.breit.hoehe,
    grundfarbe: '#2b2d31',
    hintergrundBild: null,
    hintergrundAnpassung: 'fuellen',
    abdunklung: 0,
    avatarAn: true,
    avatarForm: 'rund',
    avatarX: 60,
    avatarY: 120,
    avatarGroesse: 160,
    avatarRand: 0,
    avatarRandfarbe: '#ffffff',
    zeilen: [],
  };
}

function masse(vorlage) {
  const fest = FORMATE[vorlage.format];
  if (fest) return fest;

  const beschraenke = (wert, vorgabe) => {
    const zahl = Number(wert);
    if (!Number.isFinite(zahl)) return vorgabe;
    return Math.min(GRENZEN.maxKante, Math.max(GRENZEN.minKante, Math.round(zahl)));
  };

  return {
    breite: beschraenke(vorlage.breite, FORMATE.breit.breite),
    hoehe: beschraenke(vorlage.hoehe, FORMATE.breit.hoehe),
  };
}

/** Zeichenweg für die drei Profilbildformen. */
function avatarPfad(stift, x, y, groesse, form) {
  stift.beginPath();
  if (form === 'rund') {
    stift.arc(x + groesse / 2, y + groesse / 2, groesse / 2, 0, Math.PI * 2);
  } else if (form === 'abgerundet') {
    const radius = Math.min(groesse / 4, 40);
    stift.roundRect(x, y, groesse, groesse, radius);
  } else {
    stift.rect(x, y, groesse, groesse);
  }
  stift.closePath();
}

/**
 * Passt Text in die erlaubte Breite ein.
 *
 * Zuerst wird die Schrift verkleinert: Ein kleiner Name sieht nach einem langen
 * Namen aus, ein abgeschnittener nach einem Fehler. Unter acht Pixel wird nicht
 * weiter verkleinert — darunter wäre er ohnehin nicht mehr lesbar.
 *
 * Passt es dann immer noch nicht, wird gekürzt und mit einem Auslassungszeichen
 * versehen. Das ist der Fall bei absurd langen Namen; „bis er passt" heisst
 * eben passt, und ein mikroskopischer Name hilft niemandem.
 */
function passendeGroesse(stift, text, wunsch, maxBreite, fett) {
  const messeMit = (groesse, inhalt) => {
    stift.font = schriftFuer(groesse, fett);
    return stift.measureText(inhalt).width;
  };

  if (!maxBreite || maxBreite <= 0) {
    return { groesse: wunsch, breite: messeMit(wunsch, text), text };
  }

  let groesse = Math.max(GRENZEN.minSchrift, Math.round(wunsch));
  for (; groesse > GRENZEN.minSchrift; groesse -= 1) {
    if (messeMit(groesse, text) <= maxBreite) break;
  }

  let inhalt = text;
  if (messeMit(groesse, inhalt) > maxBreite) {
    // Kuerzen, bis es passt. Zeichenweise von hinten, damit auch bei sehr
    // breiten Zeichen nicht ueberschossen wird.
    while (inhalt.length > 1 && messeMit(groesse, `${inhalt}…`) > maxBreite) {
      inhalt = inhalt.slice(0, -1);
    }
    inhalt = `${inhalt}…`;
  }

  return { groesse, breite: messeMit(groesse, inhalt), text: inhalt };
}

async function zeichneHintergrund(stift, vorlage, breite, hoehe) {
  stift.fillStyle = vorlage.grundfarbe || '#000000';
  stift.fillRect(0, 0, breite, hoehe);

  if (!vorlage.hintergrundBild) return;

  let bild;
  try {
    bild = await loadImage(vorlage.hintergrundBild);
  } catch {
    // Ein unbrauchbares Bild darf das Ergebnis nicht verhindern — die
    // Grundfarbe steht schon, und die Vorschau zeigt sofort, dass etwas fehlt.
    return;
  }

  if (vorlage.hintergrundAnpassung === 'strecken') {
    stift.drawImage(bild, 0, 0, breite, hoehe);
    return;
  }

  // „fuellen" schneidet über, „einpassen" lässt Rand — beides ohne Verzerrung.
  const verhaeltnis =
    vorlage.hintergrundAnpassung === 'einpassen'
      ? Math.min(breite / bild.width, hoehe / bild.height)
      : Math.max(breite / bild.width, hoehe / bild.height);

  const zielBreite = bild.width * verhaeltnis;
  const zielHoehe = bild.height * verhaeltnis;
  stift.drawImage(bild, (breite - zielBreite) / 2, (hoehe - zielHoehe) / 2, zielBreite, zielHoehe);
}

async function zeichneAvatar(stift, vorlage, daten) {
  if (!vorlage.avatarAn || !daten.avatarBild) return;

  let bild;
  try {
    bild = await loadImage(daten.avatarBild);
  } catch {
    return;
  }

  const { avatarX: x, avatarY: y, avatarGroesse: groesse, avatarForm: form } = vorlage;

  stift.save();
  avatarPfad(stift, x, y, groesse, form);
  stift.clip();
  stift.drawImage(bild, x, y, groesse, groesse);
  stift.restore();

  if (vorlage.avatarRand > 0) {
    stift.save();
    avatarPfad(stift, x, y, groesse, form);
    stift.lineWidth = vorlage.avatarRand;
    stift.strokeStyle = vorlage.avatarRandfarbe || '#ffffff';
    stift.stroke();
    stift.restore();
  }
}

function zeichneZeilen(stift, vorlage, daten) {
  const gemessen = [];

  for (const zeile of vorlage.zeilen ?? []) {
    const roh = ersetze(zeile.text ?? '', daten);
    const { groesse, breite, text } = passendeGroesse(
      stift, roh, zeile.groesse ?? 40, zeile.maxBreite, zeile.fett,
    );
    gemessen.push({ text, groesse, breite, gekuerzt: text !== roh });

    if (text === '') continue;

    stift.save();
    stift.font = schriftFuer(groesse, zeile.fett);
    stift.fillStyle = zeile.farbe || '#ffffff';
    stift.textAlign =
      zeile.ausrichtung === 'mitte' ? 'center' : zeile.ausrichtung === 'rechts' ? 'right' : 'left';
    stift.textBaseline = 'alphabetic';

    if (zeile.schatten) {
      stift.shadowColor = 'rgba(0, 0, 0, 0.55)';
      stift.shadowBlur = Math.max(2, groesse / 8);
      stift.shadowOffsetY = Math.max(1, groesse / 16);
    }

    stift.fillText(text, zeile.x ?? 0, zeile.y ?? 0);
    stift.restore();
  }

  return gemessen;
}

/**
 * Erzeugt das Bild.
 *
 * @param {object} vorlage  Einstellungen aus dem Editor
 * @param {object} daten    Platzhalterwerte plus `avatarBild` (Puffer)
 * @param {object} [optionen] `mitMessung: true` liefert zusätzlich die
 *        tatsächlich verwendeten Schriftgrössen — dafür gibt es die Tests und
 *        später die Warnung im Editor.
 * @returns {Promise<Buffer|{png: Buffer, gemessen: object}>}
 */
export async function rendere(vorlage, daten = {}, optionen = {}) {
  registriereSchriften();

  const { breite, hoehe } = masse(vorlage);
  const leinwand = createCanvas(breite, hoehe);
  const stift = leinwand.getContext('2d');

  await zeichneHintergrund(stift, vorlage, breite, hoehe);

  const abdunklung = Math.min(100, Math.max(0, Number(vorlage.abdunklung) || 0));
  if (abdunklung > 0) {
    stift.fillStyle = `rgba(0, 0, 0, ${abdunklung / 100})`;
    stift.fillRect(0, 0, breite, hoehe);
  }

  await zeichneAvatar(stift, vorlage, daten);
  const zeilen = zeichneZeilen(stift, vorlage, daten);

  const png = leinwand.toBuffer('image/png');
  return optionen.mitMessung ? { png, gemessen: { breite, hoehe, zeilen } } : png;
}
