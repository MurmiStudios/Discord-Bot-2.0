import { createCanvas, loadImage } from '@napi-rs/canvas';

/** Liest einen Bildpunkt aus einem PNG-Puffer: [r, g, b, a]. */
export async function pixelAus(png, x, y) {
  const bild = await loadImage(png);
  const leinwand = createCanvas(bild.width, bild.height);
  const stift = leinwand.getContext('2d');
  stift.drawImage(bild, 0, 0);
  return [...stift.getContext?.name ? [] : []].length === 0
    ? [...stift.getImageData(x, y, 1, 1).data]
    : [];
}

/** Grösse eines PNG-Puffers, ohne ihn selbst zu zeichnen. */
export async function masse(png) {
  const bild = await loadImage(png);
  return { breite: bild.width, hoehe: bild.height };
}

/** Ein einfarbiges PNG als Platzhalter für ein Profilbild. */
export function testBild(farbe = '#ff0000', groesse = 64) {
  const leinwand = createCanvas(groesse, groesse);
  const stift = leinwand.getContext('2d');
  stift.fillStyle = farbe;
  stift.fillRect(0, 0, groesse, groesse);
  return leinwand.toBuffer('image/png');
}

/** Ist der Punkt annähernd diese Farbe? PNG-Kompression ist verlustfrei, aber
 *  Kantenglättung verschiebt Randpixel. */
export function istFarbe(pixel, hex, toleranz = 6) {
  const soll = [
    Number.parseInt(hex.slice(1, 3), 16),
    Number.parseInt(hex.slice(3, 5), 16),
    Number.parseInt(hex.slice(5, 7), 16),
  ];
  return soll.every((wert, i) => Math.abs(pixel[i] - wert) <= toleranz);
}
