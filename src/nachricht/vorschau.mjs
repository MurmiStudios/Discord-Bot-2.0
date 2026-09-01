import { html, roh, maskiere } from '../web/html/html.mjs';
import { ersetze, beispielWerte } from './platzhalter.mjs';
import { embedHatInhalt } from './modell.mjs';

export const MODUS = Object.freeze({ BEISPIEL: 'beispiel', ROH: 'roh' });

export const VORSCHAU_START = '<!--vorschau-start-->';
export const VORSCHAU_ENDE = '<!--vorschau-ende-->';

/**
 * Die Vorschau — und zwar genau eine.
 *
 * Mit JavaScript holt der Browser sie über `/nachricht/vorschau`, ohne
 * JavaScript rendert die Seite sie mit. Beides ruft diese Funktion auf. Ein
 * zweiter Erzeuger im Browser wäre bequemer zu schreiben und würde
 * unweigerlich irgendwann etwas anderes zeigen als das, was wirklich rausgeht;
 * ein Test vergleicht beide Wege deshalb auf Gleichheit.
 */
function text_mit_umbruechen(text) {
  // Erst maskieren, dann Umbrueche zu <br> — nie umgekehrt.
  return roh(maskiere(text).replace(/\r?\n/g, '<br>'));
}

/**
 * Der Farbstreifen des Embeds.
 *
 * Er kann jede Farbe haben, aber die Content-Security-Policy erlaubt kein
 * style-Attribut. Deshalb ein SVG: `fill` ist dort ein gewöhnliches Attribut
 * und keine eingebettete CSS-Anweisung — erlaubt, und ohne die CSP aufzuweichen.
 */
const HEXFARBE = /^#[0-9a-f]{6}$/i;

function farbstreifen(farbe) {
  const gewaehlt = HEXFARBE.test(String(farbe ?? '')) ? farbe : '#4b57e8';
  return html`
    <svg class="v-embed-streifen" viewBox="0 0 4 100" preserveAspectRatio="none" aria-hidden="true">
      <rect width="4" height="100" fill="${gewaehlt}"></rect>
    </svg>
  `;
}

function embedTeil(embed, umschreiben) {
  if (!embedHatInhalt(embed)) return '';

  return html`
    <div class="v-embed">
      ${farbstreifen(embed.farbe)}
      <div class="v-embed-inhalt">
        ${embed.autor ? html`<p class="v-embed-autor">${umschreiben(embed.autor)}</p>` : ''}
        ${embed.titel ? html`<p class="v-embed-titel">${umschreiben(embed.titel)}</p>` : ''}
        ${embed.beschreibung
          ? html`<p class="v-embed-text">${text_mit_umbruechen(umschreiben(embed.beschreibung))}</p>`
          : ''}
        ${embed.felder.filter((f) => f.name || f.wert).length > 0
          ? html`
              <div class="v-embed-felder">
                ${embed.felder
                  .filter((f) => f.name || f.wert)
                  .map(
                    (feld) => html`
                      <div class="v-embed-feld">
                        <p class="v-feld-name">${umschreiben(feld.name)}</p>
                        <p class="v-feld-wert">${text_mit_umbruechen(umschreiben(feld.wert))}</p>
                      </div>
                    `,
                  )}
              </div>
            `
          : ''}
        ${embed.fusszeile ? html`<p class="v-embed-fuss">${umschreiben(embed.fusszeile)}</p>` : ''}
      </div>
    </div>
  `;
}

/**
 * @param {object} nachricht  Entwurf mit text, embed, bildvorlageId
 * @param {object} optionen   modus: 'beispiel' zeigt Beispieldaten, 'roh' lässt
 *                            Platzhalter stehen
 */
export function vorschau(nachricht, { modus = MODUS.BEISPIEL, werte } = {}) {
  const daten = werte ?? beispielWerte();
  const umschreiben = (wert) => (modus === MODUS.ROH ? String(wert ?? '') : ersetze(wert, daten));

  const absender = modus === MODUS.ROH ? 'Platzhalter unverändert' : daten.user;

  return html`${roh(VORSCHAU_START)}
    <div class="vorschau-nachricht">
      <div class="v-avatar" aria-hidden="true"></div>
      <div class="v-koerper">
        <p class="v-kopf">
          <span class="v-name">Panel-Bot</span>
          <span class="v-marke">BOT</span>
          <span class="v-zeit">an ${absender}</span>
        </p>
        ${nachricht.text
          ? html`<p class="v-text">${text_mit_umbruechen(umschreiben(nachricht.text))}</p>`
          : html`<p class="v-leer">Kein Text</p>`}
        ${embedTeil(nachricht.embed ?? null, umschreiben)}
        ${nachricht.bildvorlageId
          ? html`<div class="v-bild">Bild wird beim Senden je Empfänger erzeugt</div>`
          : ''}
      </div>
    </div>
    ${roh(VORSCHAU_ENDE)}`;
}
