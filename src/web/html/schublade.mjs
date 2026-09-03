import { html } from './html.mjs';
import { entwurfAus, auszug } from '../../nachricht/entwurf.mjs';
import { ART } from '../../nachricht/modell.mjs';

/**
 * Die gespeicherten Nachrichten, griffbereit neben dem Editor.
 *
 * Der Aufbau ist Fortschrittliche Verbesserung in Reinform: Ausgeliefert wird
 * ein gewöhnlicher Verweis auf `/nachrichten` und daneben eine Liste, die das
 * `hidden`-Attribut trägt. Ohne JavaScript führt der Verweis auf die Seite mit
 * derselben Liste; mit JavaScript wird aus ihm ein Schalter, der die Liste als
 * Schublade hereinfahren lässt.
 *
 * Der Inhalt steht dabei schon in der Seite und wird nicht nachgeladen. Das
 * spart nicht nur eine Anfrage — es gibt auch keinen Zustand „lädt noch“ und
 * keinen Fall, in dem die Schublade leer bleibt, weil das Netz weg ist.
 */

export function schubladenSchalter() {
  return html`
    <a href="/nachrichten" class="schubladen-schalter" id="schubladen-schalter"
       aria-controls="schublade">Gespeicherte Nachrichten …</a>
  `;
}

export function schublade(eintraege) {
  return html`
    <aside class="schublade" id="schublade" hidden aria-label="Gespeicherte Nachrichten">
      <div class="schubladen-kopf">
        <h2>Gespeicherte Nachrichten</h2>
        <button type="button" class="schublade-zu" id="schublade-zu" aria-label="Schublade schliessen">
          ×
        </button>
      </div>

      <p class="hinweis">
        Öffnen ersetzt den Entwurf, an dem du gerade schreibst.
      </p>

      ${eintraege.length === 0
        ? html`<p class="leer">
            Noch nichts gespeichert. Das Namensfeld unten im Editor legt hier etwas ab.
          </p>`
        : html`
            <ul class="schubladenliste">
              ${eintraege.map((eintrag) => {
                const entwurf = entwurfAus(eintrag.daten);
                return html`
                  <li>
                    <a href="/nachricht?laden=${eintrag.id}" class="schubladeneintrag">
                      <span class="schubladenname">${eintrag.name}</span>
                      <span class="schubladenart">
                        ${eintrag.art === ART.KANAL ? 'Kanal' : 'Direktnachricht'}
                      </span>
                      <span class="schubladenauszug">
                        ${auszug(entwurf, 90) || 'Ohne Text — nur Embed oder Bild.'}
                      </span>
                    </a>
                  </li>
                `;
              })}
            </ul>
          `}

      <p><a href="/nachrichten">Alle verwalten</a></p>
    </aside>
  `;
}
