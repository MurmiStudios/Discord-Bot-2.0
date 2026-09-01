import { html } from './html.mjs';
import { alsAuswahlWert } from '../../versand/empfaenger.mjs';

/**
 * Empfängerauswahl für Direktnachrichten.
 *
 * Die Chips sind versteckte Formularfelder mit einem Entfernen-Knopf daneben —
 * damit funktioniert die Auswahl ohne JavaScript vollständig, und mit
 * JavaScript kommt nur die Tastaturbedienung dazu.
 *
 * Anzahl, Grenze und Pause stehen daneben, weil sie zusammen die Antwort auf
 * die Frage geben, die man an dieser Stelle wirklich hat: Wie lange dauert das,
 * und geht es überhaupt durch?
 */
export function empfaengerwahl({
  auswahl,
  aufgeloest,
  treffer,
  suchbegriff,
  konfig,
  botVerbunden,
  chipTitel,
  chipZahl,
}) {
  const dauerSekunden = Math.round((aufgeloest.anzahl * konfig.dmPauseMs) / 1000);

  return html`
    <div class="feld empfaengerfeld">
      <label for="empfaengerSuche">Empfänger</label>

      <div class="chipfeld">
        ${auswahl.length === 0
          ? html`<span class="chip-leer">Noch niemand gewählt</span>`
          : auswahl.map((eintrag) => {
              const wert = alsAuswahlWert(eintrag);
              return html`
                <span class="chip">
                  <input type="hidden" name="empfaenger" value="${wert}">
                  <span class="chip-art">${eintrag.art === 'rolle' ? 'Rolle' : 'Person'}</span>
                  <span class="chip-name">${chipTitel(eintrag)}</span>
                  ${eintrag.art === 'rolle'
                    ? html`<span class="chip-zahl">${chipZahl(eintrag)} Mitglieder</span>`
                    : ''}
                  <button type="submit" name="entfernen" value="${wert}" class="chip-weg"
                          aria-label="${chipTitel(eintrag)} entfernen">×</button>
                </span>
              `;
            })}
      </div>

      <div class="suchzeile">
        <input type="search" id="empfaengerSuche" name="empfaengerSuche" value="${suchbegriff}"
               placeholder="Mitglied oder Rolle suchen" autocomplete="off">
        <button type="submit" name="suchen" value="ja" class="knopf-leise">Suchen</button>
      </div>

      ${!botVerbunden
        ? html`<p class="hinweis-warn">
            Der Bot ist nicht verbunden — solange kennt das Panel weder Mitglieder noch Rollen.
          </p>`
        : suchbegriff === ''
          ? ''
          : treffer.length === 0
            ? html`<p class="hinweis">Zu „${suchbegriff}" wurde nichts gefunden.</p>`
            : html`
                <ul class="trefferwahl">
                  ${treffer.map(
                    (eintrag) => html`
                      <li>
                        <button type="submit" name="hinzufuegen" value="${alsAuswahlWert(eintrag)}">
                          <span class="chip-art">${eintrag.art === 'rolle' ? 'Rolle' : 'Person'}</span>
                          ${eintrag.name}
                          ${eintrag.art === 'rolle'
                            ? html`<span class="treffer-zahl">${eintrag.anzahl} Mitglieder</span>`
                            : ''}
                        </button>
                      </li>
                    `,
                  )}
                </ul>
              `}

      <p class="empfaengerbilanz">
        <strong>${aufgeloest.anzahl} von ${konfig.dmMaxEmpfaenger}</strong> Empfängern gewählt.
        Zwischen zwei Direktnachrichten liegen ${konfig.dmPauseMs} ms
        ${aufgeloest.anzahl > 1 ? html`— das sind rund ${dauerSekunden} Sekunden.` : html`.`}
      </p>

      ${aufgeloest.leereRollen.length > 0
        ? html`<p class="hinweis-warn">
            ${aufgeloest.leereRollen.map((r) => r.name).join(', ')}: Diese Rolle hat keine Mitglieder.
          </p>`
        : ''}
      ${aufgeloest.verschwunden.length > 0
        ? html`<p class="hinweis-warn">
            ${aufgeloest.verschwunden.length} gewählte Einträge gibt es nicht mehr —
            gelöschte Rollen oder ausgetretene Mitglieder.
          </p>`
        : ''}
    </div>
  `;
}
