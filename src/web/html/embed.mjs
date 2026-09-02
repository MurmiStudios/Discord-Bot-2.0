import { html } from './html.mjs';
import { GRENZE, embedZeichen } from '../../nachricht/modell.mjs';
import { platzhalterreihe } from './platzhalterreihe.mjs';

/**
 * Der Embed-Editor.
 *
 * Der Zähler steht oben am Kasten und nicht an einem einzelnen Feld: Discord
 * rechnet alle Teile gegen ein gemeinsames Limit, also gehört die Zahl auch
 * dorthin, wo sie für alle gilt.
 */
export function embedEditor({ embed, fehlerZu }) {
  const gesamt = embedZeichen(embed);

  return html`
    <fieldset class="embedkasten">
      <legend>
        Embed-Karte
        <span
          class="zaehler${gesamt > GRENZE.EMBED_GESAMT ? ' zaehler-zuviel' : ''}"
          data-embed-zaehler
          data-grenze="${GRENZE.EMBED_GESAMT}"
        >${gesamt} / ${GRENZE.EMBED_GESAMT}</span>
      </legend>

      <input type="hidden" name="embedAn" value="ja">
      ${fehlerZu('embed')}

      <div class="feld">
        <label for="embedTitel">Titel</label>
        <input type="text" id="embedTitel" name="embedTitel" value="${embed.titel}"
               data-embed-teil data-platzhalter-ziel="embedTitel">
        ${fehlerZu('embedTitel')}
        ${platzhalterreihe('embedTitel')}
      </div>

      <div class="feld">
        <label for="embedBeschreibung">Beschreibung</label>
        <textarea id="embedBeschreibung" name="embedBeschreibung" rows="5"
                  data-embed-teil data-platzhalter-ziel="embedBeschreibung">${embed.beschreibung}</textarea>
        ${fehlerZu('embedBeschreibung')}
        ${platzhalterreihe('embedBeschreibung')}
      </div>

      <div class="embedfelder">
        <p class="embedfelder-titel">Felder</p>
        ${fehlerZu('embedFelder')}
        ${embed.felder.map(
          (feld, i) => html`
            <div class="embedfeld">
              <div class="embedfeld-teil">
                <input
                  type="text" name="embedFeldName" value="${feld.name}"
                  aria-label="Name von Feld ${i + 1}" placeholder="Name"
                  data-embed-teil data-platzhalter-ziel="embedFeldName:${i}"
                >
                ${platzhalterreihe(`embedFeldName:${i}`)}
              </div>
              <div class="embedfeld-teil">
                <input
                  type="text" name="embedFeldWert" value="${feld.wert}"
                  aria-label="Wert von Feld ${i + 1}" placeholder="Wert"
                  data-embed-teil data-platzhalter-ziel="embedFeldWert:${i}"
                >
                ${platzhalterreihe(`embedFeldWert:${i}`)}
              </div>
              <button type="submit" name="feldEntfernen" value="${i}" class="knopf-leise"
                      title="Feld ${i + 1} entfernen">Entfernen</button>
            </div>
          `,
        )}
        ${embed.felder.length < GRENZE.FELDER
          ? html`<button type="submit" name="feldHinzufuegen" value="ja" class="knopf-leise">Feld hinzufügen</button>`
          : html`<p class="hinweis">Mehr als ${GRENZE.FELDER} Felder lässt Discord nicht zu.</p>`}
      </div>

      <div class="embed-zweispalt">
        <div class="feld">
          <label for="embedFusszeile">Fußzeile</label>
          <input type="text" id="embedFusszeile" name="embedFusszeile" value="${embed.fusszeile}"
                 data-embed-teil data-platzhalter-ziel="embedFusszeile">
          ${fehlerZu('embedFusszeile')}
          ${platzhalterreihe('embedFusszeile')}
        </div>
        <div class="feld">
          <label for="embedAutor">Autor</label>
          <input type="text" id="embedAutor" name="embedAutor" value="${embed.autor}"
                 data-embed-teil data-platzhalter-ziel="embedAutor">
          ${fehlerZu('embedAutor')}
          ${platzhalterreihe('embedAutor')}
        </div>
      </div>

      <div class="feld feld-schmal">
        <label for="embedFarbe">Farbstreifen</label>
        <input type="color" id="embedFarbe" name="embedFarbe" value="${embed.farbe || '#4b57e8'}">
      </div>

      <button type="submit" name="embedUmschalten" value="ja" class="knopf-leise">
        Embed-Karte entfernen
      </button>
    </fieldset>
  `;
}
