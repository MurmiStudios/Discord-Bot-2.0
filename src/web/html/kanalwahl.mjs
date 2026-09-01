import { html } from './html.mjs';

/**
 * Kanalauswahl im Layout, das man aus Discord kennt: nach Kategorien
 * gruppiert, mit dem Symbol der jeweiligen Kanalart.
 *
 * Gesperrte Kanäle bleiben sichtbar und nennen den Grund, statt zu
 * verschwinden. Ein Kanal, der fehlt, wirft die Frage auf, ob man ihn falsch
 * in Erinnerung hat; ein Kanal, der „Der Bot darf hier nicht schreiben" sagt,
 * beantwortet sie.
 *
 * Die Symbole sind SVG-Pfade und keine Emoji: Emoji sehen auf jedem System
 * anders aus, und die Kanalart soll auf einen Blick erkennbar sein.
 */
const SYMBOLE = {
  text: 'M5.5 3 4 21M13.5 3 12 21M3 8.5h18M2 15.5h18',
  ankuendigung: 'M3 10v4h4l5 4V6L7 10H3ZM16 9a4 4 0 0 1 0 6M19 6a8 8 0 0 1 0 12',
  thread: 'M4 5h16M4 10h10M8 15h8a3 3 0 0 0 3-3M8 15l3-3M8 15l3 3',
};

function symbol(art) {
  return html`
    <svg class="kanal-symbol" viewBox="0 0 24 24" aria-hidden="true" data-kanalart="${art}">
      <path d="${SYMBOLE[art] ?? SYMBOLE.text}" />
    </svg>
  `;
}

const ART_NAME = { text: 'Textkanal', ankuendigung: 'Ankündigungskanal', thread: 'Thread' };

export function kanalwahl({ kanaele, gewaehlt, suchbegriff, botVerbunden, fehler }) {
  // Nach Kategorie gruppieren, Reihenfolge aus der Kanalliste uebernehmen.
  const gruppen = new Map();
  for (const kanal of kanaele) {
    const titel = kanal.kategorieName ?? 'Ohne Kategorie';
    if (!gruppen.has(titel)) gruppen.set(titel, []);
    gruppen.get(titel).push(kanal);
  }

  return html`
    <div class="feld kanalfeld">
      <label for="kanalSuche">Kanal</label>

      <div class="suchzeile">
        <input type="search" id="kanalSuche" name="kanalSuche" value="${suchbegriff}"
               placeholder="Kanal suchen" autocomplete="off">
        <button type="submit" name="suchen" value="ja" class="knopf-leise">Suchen</button>
      </div>

      ${fehler}

      ${!botVerbunden
        ? html`<p class="hinweis-warn">
            Der Bot ist nicht verbunden — solange kennt das Panel die Kanäle des Servers nicht.
          </p>`
        : kanaele.length === 0
          ? html`<p class="hinweis">
              ${suchbegriff ? html`Zu „${suchbegriff}" wurde kein Kanal gefunden.` : 'Keine Kanäle gefunden.'}
            </p>`
          : html`
              <div class="kanalliste" role="radiogroup" aria-label="Kanal wählen">
                ${[...gruppen.entries()].map(
                  ([titel, liste]) => html`
                    <div class="kanalgruppe">
                      <p class="kanalgruppe-titel">${titel}</p>
                      ${liste.map(
                        (kanal) => html`
                          <label class="kanalzeile${kanal.darfSchreiben ? '' : ' kanal-gesperrt'}"
                                 title="${kanal.darfSchreiben ? ART_NAME[kanal.art] ?? '' : kanal.sperrgrund}">
                            <input type="radio" name="kanalId" value="${kanal.id}"
                              ${kanal.id === gewaehlt ? html`checked` : ''}
                              ${kanal.darfSchreiben ? '' : html`disabled`}>
                            ${symbol(kanal.art)}
                            <span class="kanal-name">${kanal.name}</span>
                            ${kanal.darfSchreiben
                              ? ''
                              : html`<span class="kanal-grund">${kanal.sperrgrund}</span>`}
                          </label>
                        `,
                      )}
                    </div>
                  `,
                )}
              </div>
            `}
    </div>
  `;
}
