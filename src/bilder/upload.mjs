import { randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadImage } from '@napi-rs/canvas';

/** Eine Grössenangabe, die auch unter einem Megabyte noch etwas aussagt. */
export function alsGroesse(bytes) {
  return bytes >= 1024 * 1024
    ? `${Math.round((bytes / 1024 / 1024) * 10) / 10} MB`
    : `${Math.round(bytes / 1024)} KB`;
}

export class UploadFehler extends Error {
  constructor(meldung) {
    super(meldung);
    this.name = 'UploadFehler';
  }
}

/**
 * Erkennung am Inhalt, nicht an der Endung.
 *
 * Eine umbenannte Datei ist der älteste Trick überhaupt. Die Endung sagt
 * nichts; die ersten Bytes sagen alles.
 */
const SIGNATUREN = [
  { endung: 'png', pruefe: (b) => b.length > 8 && b.subarray(1, 4).toString('latin1') === 'PNG' },
  { endung: 'jpg', pruefe: (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  {
    endung: 'webp',
    pruefe: (b) =>
      b.length > 12 &&
      b.subarray(0, 4).toString('latin1') === 'RIFF' &&
      b.subarray(8, 12).toString('latin1') === 'WEBP',
  },
];

/**
 * Prüft einen hochgeladenen Puffer und legt ihn ab.
 *
 * Der Dateiname wird ausschliesslich hier vergeben — der vom Browser
 * gelieferte Name wird nicht einmal bereinigt, sondern gar nicht benutzt.
 * Damit gibt es keinen Weg aus dem Upload-Verzeichnis heraus, den man
 * übersehen könnte.
 *
 * @throws {UploadFehler} mit einer Meldung, die sagt, was zu tun ist
 */
export async function pruefeUpload(puffer, _gelieferterName, { uploadMaxBytes, uploadMaxKante, verzeichnis }) {
  if (!puffer || puffer.length === 0) {
    throw new UploadFehler('Die Datei ist leer.');
  }

  if (puffer.length > uploadMaxBytes) {
    throw new UploadFehler(
      `Das Bild ist zu gross (${alsGroesse(puffer.length)}). Erlaubt sind ` +
        `${alsGroesse(uploadMaxBytes)} — die Grenze steht als UPLOAD_MAX_BYTES in der .env.`,
    );
  }

  const treffer = SIGNATUREN.find((s) => s.pruefe(puffer));
  if (!treffer) {
    throw new UploadFehler(
      'Das ist kein Bild, das hier verarbeitet werden kann. Erlaubt sind PNG, JPEG und WebP. ' +
        'Geprüft wird der Inhalt, nicht die Dateiendung.',
    );
  }

  let bild;
  try {
    bild = await loadImage(puffer);
  } catch {
    throw new UploadFehler('Das Bild lässt sich nicht öffnen — vermutlich ist die Datei beschädigt.');
  }

  if (bild.width > uploadMaxKante || bild.height > uploadMaxKante) {
    throw new UploadFehler(
      `Das Bild ist ${bild.width} × ${bild.height} Pixel gross. Die längste Kante darf ` +
        `${uploadMaxKante} Pixel nicht überschreiten — die Grenze steht als UPLOAD_MAX_EDGE in der .env.`,
    );
  }

  const dateiname = `${randomBytes(16).toString('hex')}.${treffer.endung}`;
  mkdirSync(verzeichnis, { recursive: true });
  writeFileSync(join(verzeichnis, dateiname), puffer);

  return { dateiname, breite: bild.width, hoehe: bild.height, bytes: puffer.length };
}

/**
 * Ist das ein Name, den `pruefeUpload` vergeben hat?
 *
 * Wer eine Vorlage speichert, schickt den Namen des Hintergrundbildes als
 * Formularfeld mit — also als etwas, das jemand ändern kann. Bevor daraus ein
 * Dateipfad wird, muss er genau der Form entsprechen, die hier vergeben wird.
 * Ein Name mit `..` oder einem Schrägstrich scheitert an diesem Muster; damit
 * gibt es keinen Weg aus dem Verzeichnis heraus.
 */
const ABLAGENAME = /^[0-9a-f]{32}\.(png|jpg|webp)$/;

export function istAblagename(name) {
  return typeof name === 'string' && ABLAGENAME.test(name);
}

/** Der volle Pfad zu einem abgelegten Bild — oder null, wenn der Name nicht passt. */
export function bildPfad(verzeichnis, name) {
  return istAblagename(name) ? join(verzeichnis, name) : null;
}
