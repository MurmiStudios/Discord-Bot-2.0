import { GRENZE } from '../../nachricht/modell.mjs';
import { zerlegeKnopfwert, fuegeEin } from '../../nachricht/platzhalterziel.mjs';
import { PLATZHALTER } from '../../nachricht/platzhalter.mjs';
import { MODUS } from '../../nachricht/vorschau.mjs';

/**
 * Die Knöpfe, die den Entwurf nur umbauen, statt etwas auszulösen.
 *
 * Embed anhängen, ein Feld hinzufügen, eine Variable einsetzen, die Vorschau
 * wechseln — jede Seite mit dem Nachrichten-Baukasten braucht genau dieselben
 * sechs. Dreimal geschrieben liefen sie auseinander, und dann liesse sich auf
 * einer Seite ein Embed-Feld entfernen und auf der anderen nicht.
 *
 * @returns {boolean} true, wenn ein Zwischenschritt behandelt wurde — dann ist
 *          die Anfrage fertig und der Entwurf soll nur neu gezeigt werden.
 */

const ERLAUBTE_PLATZHALTER = new Set(PLATZHALTER.map((p) => p.name));

export function zwischenschritt(koerper = {}, entwurf) {
  if (koerper.embedUmschalten !== undefined) {
    entwurf.embedAn = !entwurf.embedAn;
    return true;
  }

  if (koerper.feldHinzufuegen !== undefined) {
    if (entwurf.embed.felder.length < GRENZE.FELDER) {
      entwurf.embed.felder.push({ name: '', wert: '' });
    }
    return true;
  }

  if (koerper.feldEntfernen !== undefined) {
    const index = Number(koerper.feldEntfernen);
    if (Number.isInteger(index) && index >= 0 && index < entwurf.embed.felder.length) {
      entwurf.embed.felder.splice(index, 1);
    }
    return true;
  }

  // Ohne JavaScript ans Ende des gewählten Feldes — mit JavaScript setzt
  // editor.js ihn vorher an die Schreibmarke.
  if (koerper.platzhalterEinfuegen !== undefined) {
    const geklickt = zerlegeKnopfwert(koerper.platzhalterEinfuegen);
    if (geklickt && ERLAUBTE_PLATZHALTER.has(geklickt.platzhalter)) {
      fuegeEin(entwurf, geklickt.ziel, geklickt.platzhalter);
    }
    return true;
  }

  if (koerper.vorschauWechseln !== undefined) {
    entwurf.vorschauModus = koerper.vorschauWechseln === MODUS.ROH ? MODUS.ROH : MODUS.BEISPIEL;
    return true;
  }

  if (koerper.vorschauErneuern !== undefined) return true;

  return false;
}

/**
 * Der Aktiv-Schalter aus dem Formularkörper.
 *
 * Das versteckte „nein“ davor kommt immer mit; ohne es liesse sich ein Haken
 * nie wieder entfernen.
 */
export function aktivAus(koerper = {}) {
  const werte = Array.isArray(koerper.aktiv) ? koerper.aktiv : [koerper.aktiv];
  return werte.includes('ja');
}
