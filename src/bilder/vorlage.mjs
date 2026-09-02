import { FORMATE, standardVorlage } from './renderer.mjs';

/**
 * Vom Formular zur Vorlage — und die Prüfung dazwischen.
 *
 * Drei Funktionen mit klarer Aufgabenteilung:
 *
 * - `vorlageAus` baut aus dem Formularkörper eine Vorlage. Auswahlfelder werden
 *   dabei auf die erlaubten Werte gebracht: Das Formular bietet nur gültige an,
 *   ein untergeschobener Wert bekommt die Vorgabe und keine Fehlermeldung.
 * - `pruefeVorlage` sagt, ob gespeichert werden darf. Sie meldet alles, was ein
 *   Mensch getippt haben kann — Name, Farben, Zahlen, Textlängen.
 * - `sichereVorlage` bringt Farben und Zahlen in den Bereich, den der Renderer
 *   verträgt. Die Vorschau benutzt sie, damit auch ein halbfertiger Entwurf ein
 *   Bild ergibt; die Fehler stehen daneben auf der Seite.
 */

export const GRENZE_VORLAGE = Object.freeze({
  NAME: 60,
  ZEILEN: 12,
  ZEILENTEXT: 200,
  SCHRIFT_MIN: 8,
  SCHRIFT_MAX: 400,
  KANTE_MIN: 1,
  KANTE_MAX: 4096,
});

export const FORMEN = Object.freeze(['rund', 'abgerundet', 'eckig']);
export const ANPASSUNGEN = Object.freeze(['fuellen', 'einpassen', 'strecken']);
export const AUSRICHTUNGEN = Object.freeze(['links', 'mitte', 'rechts']);
export const FORMATNAMEN = Object.freeze([...Object.keys(FORMATE), 'eigen']);

const FARBE = /^#[0-9a-fA-F]{6}$/;

const alsListe = (wert) => (wert === undefined ? [] : Array.isArray(wert) ? wert : [wert]);

/** Ein Ankreuzfeld liefert nichts, wenn es nicht angekreuzt ist — daher das
 *  versteckte „nein" davor, das immer mitkommt. */
const angekreuzt = (wert) => alsListe(wert).includes('ja');

const einsAus = (wert, erlaubt, vorgabe) =>
  erlaubt.includes(String(wert)) ? String(wert) : vorgabe;

const zahl = (wert, vorgabe) => {
  const n = Number(wert);
  return Number.isFinite(n) ? n : vorgabe;
};

const klemme = (wert, min, max) => Math.min(max, Math.max(min, Math.round(wert)));

const farbeOder = (wert, vorgabe) => (FARBE.test(String(wert ?? '')) ? String(wert) : vorgabe);

export function vorlageAus(koerper = {}) {
  const vorgabe = standardVorlage();

  const texte = alsListe(koerper.zeileText).slice(0, GRENZE_VORLAGE.ZEILEN);
  const x = alsListe(koerper.zeileX);
  const y = alsListe(koerper.zeileY);
  const groessen = alsListe(koerper.zeileGroesse);
  const farben = alsListe(koerper.zeileFarbe);
  const ausrichtungen = alsListe(koerper.zeileAusrichtung);
  const maxBreiten = alsListe(koerper.zeileMaxBreite);
  // Fett und Schatten kommen als Liste der betroffenen Zeilennummern. Über den
  // Wert statt über die Reihenfolge, weil ein nicht angekreuztes Feld gar nicht
  // mitgeschickt wird — die Reihenfolge wäre also verschoben.
  const fett = new Set(alsListe(koerper.zeileFett).map(String));
  const schatten = new Set(alsListe(koerper.zeileSchatten).map(String));

  return {
    format: einsAus(koerper.format, FORMATNAMEN, vorgabe.format),
    breite: zahl(koerper.breite, vorgabe.breite),
    hoehe: zahl(koerper.hoehe, vorgabe.hoehe),
    grundfarbe: String(koerper.grundfarbe ?? vorgabe.grundfarbe),
    hintergrundBild: String(koerper.hintergrundBild ?? '') || null,
    hintergrundAnpassung: einsAus(
      koerper.hintergrundAnpassung, ANPASSUNGEN, vorgabe.hintergrundAnpassung,
    ),
    abdunklung: zahl(koerper.abdunklung, vorgabe.abdunklung),
    avatarAn: angekreuzt(koerper.avatarAn),
    avatarForm: einsAus(koerper.avatarForm, FORMEN, vorgabe.avatarForm),
    avatarX: zahl(koerper.avatarX, vorgabe.avatarX),
    avatarY: zahl(koerper.avatarY, vorgabe.avatarY),
    avatarGroesse: zahl(koerper.avatarGroesse, vorgabe.avatarGroesse),
    avatarRand: zahl(koerper.avatarRand, vorgabe.avatarRand),
    avatarRandfarbe: String(koerper.avatarRandfarbe ?? vorgabe.avatarRandfarbe),
    zeilen: texte.map((text, i) => ({
      text: String(text ?? ''),
      x: zahl(x[i], 60),
      y: zahl(y[i], 200),
      groesse: zahl(groessen[i], 40),
      farbe: String(farben[i] ?? '#ffffff'),
      ausrichtung: einsAus(ausrichtungen[i], AUSRICHTUNGEN, 'links'),
      maxBreite: zahl(maxBreiten[i], 0),
      fett: fett.has(String(i)),
      schatten: schatten.has(String(i)),
    })),
  };
}

/** Eine leere Zeile, wie „Zeile hinzufügen" sie anlegt. */
export function neueZeile(vorlage) {
  return {
    text: '',
    x: 60,
    y: 100 + (vorlage.zeilen?.length ?? 0) * 60,
    groesse: 40,
    farbe: '#ffffff',
    ausrichtung: 'links',
    maxBreite: 0,
    fett: false,
    schatten: true,
  };
}

export function pruefeVorlage(name, vorlage) {
  const fehler = [];
  const melde = (feld, meldung) => fehler.push({ feld, meldung });

  const sauber = String(name ?? '').trim();
  if (sauber === '') melde('name', 'Gib der Vorlage einen Namen.');
  else if (sauber.length > GRENZE_VORLAGE.NAME) {
    melde('name', `Der Name ist ${sauber.length} Zeichen lang, erlaubt sind ${GRENZE_VORLAGE.NAME}.`);
  }

  if (vorlage.format === 'eigen') {
    for (const [feld, wert, wort] of [
      ['breite', vorlage.breite, 'Die Breite'],
      ['hoehe', vorlage.hoehe, 'Die Höhe'],
    ]) {
      if (!Number.isFinite(wert) || wert < GRENZE_VORLAGE.KANTE_MIN || wert > GRENZE_VORLAGE.KANTE_MAX) {
        melde(feld, `${wort} muss zwischen ${GRENZE_VORLAGE.KANTE_MIN} und ${GRENZE_VORLAGE.KANTE_MAX} Pixeln liegen.`);
      }
    }
  }

  if (!FARBE.test(vorlage.grundfarbe)) {
    melde('grundfarbe', 'Die Grundfarbe muss eine Farbe wie #2b2d31 sein.');
  }
  if (!FARBE.test(vorlage.avatarRandfarbe)) {
    melde('avatarRandfarbe', 'Die Randfarbe muss eine Farbe wie #ffffff sein.');
  }

  if (!Number.isFinite(vorlage.abdunklung) || vorlage.abdunklung < 0 || vorlage.abdunklung > 100) {
    melde('abdunklung', 'Die Abdunklung ist ein Wert von 0 bis 100 Prozent.');
  }

  if (vorlage.avatarAn && (!Number.isFinite(vorlage.avatarGroesse) || vorlage.avatarGroesse < 1)) {
    melde('avatarGroesse', 'Das Profilbild braucht eine Grösse von mindestens einem Pixel.');
  }

  if ((vorlage.zeilen?.length ?? 0) > GRENZE_VORLAGE.ZEILEN) {
    melde('zeilen', `Mehr als ${GRENZE_VORLAGE.ZEILEN} Textzeilen sind nicht vorgesehen.`);
  }

  (vorlage.zeilen ?? []).forEach((zeile, i) => {
    if (zeile.text.length > GRENZE_VORLAGE.ZEILENTEXT) {
      melde(`zeile${i}`, `Zeile ${i + 1} ist ${zeile.text.length} Zeichen lang, erlaubt sind ${GRENZE_VORLAGE.ZEILENTEXT}.`);
    }
    if (!FARBE.test(zeile.farbe)) {
      melde(`zeile${i}`, `Zeile ${i + 1} hat keine gültige Farbe.`);
    }
    if (
      !Number.isFinite(zeile.groesse) ||
      zeile.groesse < GRENZE_VORLAGE.SCHRIFT_MIN ||
      zeile.groesse > GRENZE_VORLAGE.SCHRIFT_MAX
    ) {
      melde(`zeile${i}`, `Die Schriftgrösse von Zeile ${i + 1} muss zwischen ${GRENZE_VORLAGE.SCHRIFT_MIN} und ${GRENZE_VORLAGE.SCHRIFT_MAX} liegen.`);
    }
  });

  return { ok: fehler.length === 0, name: sauber, fehler };
}

/**
 * Bringt eine Vorlage in den Bereich, den der Renderer verträgt.
 *
 * Wichtig für die Vorschau: Sie soll auch dann ein Bild zeigen, wenn noch etwas
 * fehlt. Und wichtig für die Sicherheit: Was hier hinausgeht, ist eine geprüfte
 * Farbe und eine geprüfte Zahl — nichts, was aus einem Formular kommt, landet
 * ungeprüft im Zeichenbefehl.
 */
export function sichereVorlage(vorlage) {
  const vorgabe = standardVorlage();

  return {
    ...vorlage,
    format: einsAus(vorlage.format, FORMATNAMEN, vorgabe.format),
    breite: klemme(zahl(vorlage.breite, vorgabe.breite), GRENZE_VORLAGE.KANTE_MIN, GRENZE_VORLAGE.KANTE_MAX),
    hoehe: klemme(zahl(vorlage.hoehe, vorgabe.hoehe), GRENZE_VORLAGE.KANTE_MIN, GRENZE_VORLAGE.KANTE_MAX),
    grundfarbe: farbeOder(vorlage.grundfarbe, vorgabe.grundfarbe),
    hintergrundAnpassung: einsAus(vorlage.hintergrundAnpassung, ANPASSUNGEN, vorgabe.hintergrundAnpassung),
    abdunklung: klemme(zahl(vorlage.abdunklung, 0), 0, 100),
    avatarForm: einsAus(vorlage.avatarForm, FORMEN, vorgabe.avatarForm),
    avatarX: klemme(zahl(vorlage.avatarX, 0), -4096, 4096),
    avatarY: klemme(zahl(vorlage.avatarY, 0), -4096, 4096),
    avatarGroesse: klemme(zahl(vorlage.avatarGroesse, vorgabe.avatarGroesse), 1, GRENZE_VORLAGE.KANTE_MAX),
    avatarRand: klemme(zahl(vorlage.avatarRand, 0), 0, 64),
    avatarRandfarbe: farbeOder(vorlage.avatarRandfarbe, vorgabe.avatarRandfarbe),
    zeilen: (vorlage.zeilen ?? []).slice(0, GRENZE_VORLAGE.ZEILEN).map((zeile) => ({
      ...zeile,
      text: String(zeile.text ?? '').slice(0, GRENZE_VORLAGE.ZEILENTEXT),
      x: klemme(zahl(zeile.x, 0), -4096, 8192),
      y: klemme(zahl(zeile.y, 0), -4096, 8192),
      groesse: klemme(zahl(zeile.groesse, 40), GRENZE_VORLAGE.SCHRIFT_MIN, GRENZE_VORLAGE.SCHRIFT_MAX),
      farbe: farbeOder(zeile.farbe, '#ffffff'),
      ausrichtung: einsAus(zeile.ausrichtung, AUSRICHTUNGEN, 'links'),
      maxBreite: klemme(zahl(zeile.maxBreite, 0), 0, GRENZE_VORLAGE.KANTE_MAX),
      fett: zeile.fett === true,
      schatten: zeile.schatten === true,
    })),
  };
}
