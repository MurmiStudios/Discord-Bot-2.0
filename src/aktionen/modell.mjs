/**
 * Aktionsleisten: Knöpfe unter einer Nachricht.
 *
 * Die Grenzen kommen von Discord und nicht von uns. Sie stehen hier an einer
 * Stelle, damit die Oberfläche dieselben Zahlen zeigt, gegen die später der
 * Versand prüft — sonst baut man fünf Knöpfe zu viel und merkt es erst, wenn
 * Discord die Nachricht ablehnt.
 */

export const GRENZE = Object.freeze({
  /** Discord bricht nach fünf Knöpfen in eine neue Reihe um. */
  JE_REIHE: 5,
  /** Fünf Reihen à fünf Knöpfen. */
  REIHEN: 5,
  KNOEPFE: 25,
  BESCHRIFTUNG: 80,
  /** Discords eigene Grenze für die Kennung eines Knopfes. */
  KENNUNG: 100,
  NAME: 60,
});

/**
 * Die vier Farben, die Discord kennt — unter ihren deutschen Namen.
 *
 * `wert` ist der Name in der Discord-API, `stil` die Zahl. Beides steht hier,
 * damit nirgends sonst eine Zahl auftaucht, die niemand einordnen kann.
 */
export const FARBEN = Object.freeze([
  { wert: 'blau', name: 'Blau', stil: 1, hex: '#5865f2' },
  { wert: 'grau', name: 'Grau', stil: 2, hex: '#4e5058' },
  { wert: 'gruen', name: 'Grün', stil: 3, hex: '#248046' },
  { wert: 'rot', name: 'Rot', stil: 4, hex: '#da373c' },
]);

const FARB_KARTE = new Map(FARBEN.map((f) => [f.wert, f]));

export function farbe(wert) {
  return FARB_KARTE.get(String(wert)) ?? FARBEN[0];
}

export function leererKnopf() {
  return { kennung: null, beschriftung: '', emoji: '', farbe: 'grau', aktionen: [] };
}

/**
 * Die Aktionsarten, die ein Knopf auslösen kann.
 *
 * Eine Liste und kein Objekt: Die Reihenfolge ist die im Auswahlfeld, und die
 * soll nicht davon abhängen, in welcher Reihenfolge jemand Schlüssel getippt
 * hat. Die Kette schlägt zur Laufzeit im eigenen Verzeichnis nach — hier steht
 * nur, was die Oberfläche anbieten und prüfen muss.
 */
export const AKTIONSARTEN = Object.freeze([
  {
    wert: 'dm',
    name: 'Direktnachricht senden',
    beschreibung: 'Verschickt eine gespeicherte Nachricht an die Person, die geklickt hat.',
    /** Ohne diese Angabe wüsste die Aktion nicht, was sie verschicken soll. */
    pflichtfeld: 'nachrichtId',
    fehlt: 'Wähle die Nachricht aus, die verschickt werden soll.',
  },
]);

const ARTEN_KARTE = new Map(AKTIONSARTEN.map((a) => [a.wert, a]));

export function aktionsart(wert) {
  return ARTEN_KARTE.get(String(wert));
}

export function leereAktion(art) {
  return { art: aktionsart(art)?.wert ?? AKTIONSARTEN[0].wert, nachrichtId: '' };
}

/**
 * Wie Discord die Knöpfe auf Reihen verteilt.
 *
 * Die Oberfläche zeigt dieselbe Aufteilung. Wer sechs Knöpfe baut, soll im
 * Panel sehen, dass der sechste allein in einer zweiten Reihe landet — und
 * nicht erst in Discord.
 */
export function zeilenAufteilung(knoepfe = []) {
  const reihen = [];
  for (let i = 0; i < knoepfe.length; i += GRENZE.JE_REIHE) {
    reihen.push(knoepfe.slice(i, i + GRENZE.JE_REIHE));
  }
  return reihen;
}

/** Ein Knopf ohne Beschriftung *und* ohne Emoji ist in Discord unsichtbar. */
export function knopfHatInhalt(knopf) {
  return String(knopf?.beschriftung ?? '').trim() !== '' || String(knopf?.emoji ?? '').trim() !== '';
}

/**
 * Verschiebt einen Knopf um eine Stelle.
 *
 * @returns {Array} eine neue Liste — die alte bleibt unberührt
 */
export function verschiebe(knoepfe, index, richtung) {
  const ziel = index + richtung;
  if (index < 0 || index >= knoepfe.length || ziel < 0 || ziel >= knoepfe.length) {
    return [...knoepfe];
  }

  const neu = [...knoepfe];
  [neu[index], neu[ziel]] = [neu[ziel], neu[index]];
  return neu;
}

/**
 * Prüft eine Leiste.
 *
 * Leere Knöpfe werden nicht stillschweigend weggeworfen: Wer einen angelegt und
 * nicht ausgefüllt hat, soll das lesen, statt sich zu wundern, wohin er ist.
 */
export function pruefeLeiste({ name, knoepfe = [] }) {
  const fehler = [];
  const sauber = String(name ?? '').trim();

  if (sauber === '') {
    fehler.push({ feld: 'name', meldung: 'Gib der Aktionsleiste einen Namen.' });
  } else if (sauber.length > GRENZE.NAME) {
    fehler.push({
      feld: 'name',
      meldung: `Der Name ist ${sauber.length} Zeichen lang, erlaubt sind ${GRENZE.NAME}.`,
    });
  }

  if (knoepfe.length > GRENZE.KNOEPFE) {
    fehler.push({
      feld: 'knoepfe',
      meldung: `Discord erlaubt höchstens ${GRENZE.KNOEPFE} Knöpfe je Nachricht (${GRENZE.REIHEN} Reihen à ${GRENZE.JE_REIHE}).`,
    });
  }

  knoepfe.forEach((knopf, i) => {
    if (!knopfHatInhalt(knopf)) {
      fehler.push({
        feld: `knopf${i}`,
        meldung: `Knopf ${i + 1} hat weder Beschriftung noch Emoji — in Discord wäre er unsichtbar.`,
      });
    }
    if (String(knopf.beschriftung ?? '').length > GRENZE.BESCHRIFTUNG) {
      fehler.push({
        feld: `knopf${i}`,
        meldung: `Die Beschriftung von Knopf ${i + 1} ist länger als ${GRENZE.BESCHRIFTUNG} Zeichen.`,
      });
    }

    // Eine halb ausgefüllte Aktion wird nicht stillschweigend weggeworfen: Sonst
    // hätte jemand einen Knopf gebaut, der beim Klicken nichts tut, und erst der
    // Klickende merkte es.
    (knopf.aktionen ?? []).forEach((aktion, j) => {
      const art = aktionsart(aktion?.art);

      if (!art) {
        fehler.push({
          feld: `knopf${i}`,
          meldung: `Aktion ${j + 1} von Knopf ${i + 1} nennt eine Art, die das Panel nicht kennt.`,
        });
        return;
      }

      if (art.pflichtfeld && String(aktion[art.pflichtfeld] ?? '') === '') {
        fehler.push({
          feld: `knopf${i}`,
          meldung: `Aktion ${j + 1} von Knopf ${i + 1}: ${art.fehlt}`,
        });
      }
    });
  });

  return { ok: fehler.length === 0, name: sauber, fehler };
}
