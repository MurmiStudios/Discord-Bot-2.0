import { html } from './html.mjs';
import { GRENZE } from '../../nachricht/modell.mjs';
import { platzhalterreihe } from './platzhalterreihe.mjs';
import { embedEditor } from './embed.mjs';
import { vorschau, MODUS } from '../../nachricht/vorschau.mjs';

/**
 * Die Teile, aus denen jede Nachricht zusammengesetzt wird.
 *
 * Der Nachrichteneditor braucht sie, die Willkommensnachricht braucht sie, und
 * die Rollen-Nachrichten werden sie brauchen. Kopiert liefen sie auseinander —
 * und dann hätte eine Seite Platzhalter im Embed und die andere nicht, ohne
 * dass es jemandem auffällt.
 *
 * Was hier *nicht* steht, ist alles Zielbezogene: Empfänger, Kanal, Reiter,
 * Senden. Das unterscheidet die Seiten, und genau darum gehört es nicht in
 * einen gemeinsamen Baustein.
 */

export function fehlerZu(fehler, feld) {
  const treffer = fehler.filter((f) => f.feld === feld);
  if (treffer.length === 0) return '';
  return html`<p class="feldfehler" role="alert">${treffer.map((f) => html`${f.meldung} `)}</p>`;
}

export function textfeld(entwurf, fehler = [], { beschriftung = 'Text' } = {}) {
  return html`
    <div class="feld">
      <label for="text">
        ${beschriftung}
        <span class="zaehler" data-zaehler-fuer="text" data-grenze="${GRENZE.TEXT}">
          ${entwurf.text.length} / ${GRENZE.TEXT}
        </span>
      </label>
      <textarea id="text" name="text" rows="8" maxlength="${GRENZE.TEXT * 2}"
                data-platzhalter-ziel="text">${entwurf.text}</textarea>
      ${fehlerZu(fehler, 'text')}
    </div>

    ${platzhalterreihe('text', { beschriftung: 'Variablen einfügen' })}
  `;
}

export function embedteil(entwurf, fehler = []) {
  if (entwurf.embedAn) {
    return embedEditor({ embed: entwurf.embed, fehlerZu: (feld) => fehlerZu(fehler, feld) });
  }

  return html`
    <div class="embed-anbieten">
      <button type="submit" name="embedUmschalten" value="ja" class="knopf-leise">
        Embed-Karte anhängen
      </button>
    </div>
  `;
}

/**
 * Welche Bildvorlage die Nachricht mitschickt.
 *
 * Beim Versand entsteht daraus je Empfänger ein eigenes Bild — mit seinem
 * Namen und seinem Profilbild. Gibt es noch keine Vorlage, steht hier der Weg
 * dorthin statt eines leeren Auswahlfeldes.
 */
export function bildwahl(entwurf, vorlagen = []) {
  if (vorlagen.length === 0) {
    return html`
      <input type="hidden" name="bildvorlageId" value="">
      <p class="hinweis">
        Noch keine Bildvorlage vorhanden. Unter
        <a href="/vorlagen">Bildvorlagen</a> lässt sich eine anlegen; sie wird dann
        je Empfänger mit dessen Namen und Profilbild gefüllt.
      </p>
    `;
  }

  const gewaehlt = String(entwurf.bildvorlageId ?? '');

  return html`
    <div class="feld feld-mittel">
      <label for="bildvorlageId">Bildvorlage</label>
      <select id="bildvorlageId" name="bildvorlageId">
        <option value=""${gewaehlt === '' ? html` selected` : ''}>Keine</option>
        ${vorlagen.map(
          (v) => html`
            <option value="${v.id}"${gewaehlt === String(v.id) ? html` selected` : ''}>${v.name}</option>
          `,
        )}
      </select>
      <p class="hinweis">Jeder Empfänger bekommt sein eigenes Bild.</p>
    </div>
  `;
}

/**
 * Die Vorschau — derselbe Erzeuger wie überall, damit sie nirgends etwas
 * anderes zeigt als das, was rausgeht.
 */
export function vorschauteil(entwurf, { nachricht }) {
  return html`
    <input type="hidden" name="vorschauModus" value="${entwurf.vorschauModus}">

    <section class="vorschaubereich" aria-label="Vorschau">
      <div class="vorschaukopf">
        <h2>Vorschau</h2>
        <div class="vorschauwahl" role="group" aria-label="Ansicht der Vorschau">
          <button type="submit" name="vorschauWechseln" value="${MODUS.BEISPIEL}"
            class="vorschau-knopf${entwurf.vorschauModus === MODUS.BEISPIEL ? ' vorschau-aktiv' : ''}"
            aria-pressed="${entwurf.vorschauModus === MODUS.BEISPIEL ? 'true' : 'false'}"
          >Mit Beispieldaten</button>
          <button type="submit" name="vorschauWechseln" value="${MODUS.ROH}"
            class="vorschau-knopf${entwurf.vorschauModus === MODUS.ROH ? ' vorschau-aktiv' : ''}"
            aria-pressed="${entwurf.vorschauModus === MODUS.ROH ? 'true' : 'false'}"
          >Rohtext</button>
          <button type="submit" name="vorschauErneuern" value="ja" class="knopf-leise"
                  data-nur-ohne-js>Vorschau aktualisieren</button>
        </div>
      </div>
      <div class="vorschau-flaeche" id="vorschau">
        ${vorschau(nachricht, { modus: entwurf.vorschauModus })}
      </div>
    </section>
  `;
}
