import { html } from '../html/html.mjs';
import { seite } from '../html/layout.mjs';
import { verlangt } from '../mw/verlangt.mjs';
import { STUFE } from '../../auth/rechte.mjs';
import { ART } from '../../nachricht/modell.mjs';
import { entwurfAus, auszug } from '../../nachricht/entwurf.mjs';
import { alsZeitpunkt } from '../html/zeit.mjs';

/**
 * Die Liste der gespeicherten Nachrichten.
 *
 * Der Filter steht in der Adresse und nicht in einem Cookie: Eine gefilterte
 * Liste lässt sich so verlinken, und ein Neuladen ändert nichts an dem, was man
 * gerade sieht. Ohne JavaScript funktioniert er ohnehin nur so.
 */

const FILTER = Object.freeze([
  { wert: 'alle', name: 'Alle' },
  { wert: ART.DM, name: 'Direktnachricht' },
  { wert: ART.KANAL, name: 'Kanal' },
]);

/** Ein unbekannter Wert in der Adresse ist kein Fehler — er heisst „alle". */
export function filterAus(roh) {
  const wert = String(roh ?? 'alle');
  return FILTER.some((f) => f.wert === wert) ? wert : 'alle';
}

function filterleiste(aktiv, stand) {
  const zahlFuer = (wert) => (wert === 'alle' ? stand.gesamt : (stand[wert] ?? 0));

  return html`
    <div class="reiter" role="tablist" aria-label="Art der Nachricht">
      ${FILTER.map(
        (f) => html`
          <a href="/nachrichten?art=${f.wert}" role="tab"
             aria-selected="${f.wert === aktiv ? 'true' : 'false'}"
             class="reiter-knopf${f.wert === aktiv ? ' reiter-aktiv' : ''}"
          >${f.name} <span class="reiter-zahl">${zahlFuer(f.wert)}</span></a>
        `,
      )}
    </div>
  `;
}

/** Wohin die Nachricht geht — in Worten, nicht als Kennung. */
function zielText(eintrag, gildenAnsicht, guildId) {
  const entwurf = entwurfAus(eintrag.daten);

  if (entwurf.art === ART.KANAL) {
    const kanal = entwurf.kanalId ? gildenAnsicht.findeKanal(entwurf.kanalId, guildId) : undefined;
    if (!entwurf.kanalId) return 'Kein Kanal gemerkt';
    return kanal ? `#${kanal.name}` : 'Kanal nicht mehr vorhanden';
  }

  const anzahl = entwurf.empfaenger.length;
  if (anzahl === 0) return 'Keine Empfänger gemerkt';
  return `${anzahl} ${anzahl === 1 ? 'Eintrag' : 'Einträge'} gemerkt`;
}

function karte(eintrag, gildenAnsicht, guildId) {
  const entwurf = entwurfAus(eintrag.daten);
  const text = auszug(entwurf);

  return html`
    <li class="ablagekarte">
      <div class="ablagekopf">
        <span class="ablagename">${eintrag.name}</span>
        <span class="ablageart">${eintrag.art === ART.KANAL ? 'Kanal' : 'Direktnachricht'}</span>
      </div>

      ${eintrag.beschaedigt
        ? html`<p class="hinweis-warn">
            Der Inhalt dieser Nachricht ist nicht lesbar. Sie lässt sich löschen, aber nicht öffnen.
          </p>`
        : html`<p class="ablageauszug">${text || 'Ohne Text — nur Embed oder Bild.'}</p>`}

      <p class="ablagefuss">
        <span class="ablageziel">${zielText(eintrag, gildenAnsicht, guildId)}</span>
        <span class="ablagezeit">Zuletzt geändert ${alsZeitpunkt(eintrag.geaendertAm)}</span>
      </p>
    </li>
  `;
}

export function registriereNachrichten(app, { bot, konfig, nachrichtenAblage, gildenAnsicht }) {
  app.get('/nachrichten', verlangt(STUFE.MODERATOR), (req, res) => {
    const aktiv = filterAus(req.query.art);
    const eintraege = nachrichtenAblage.alle(
      konfig.guildId, aktiv === 'alle' ? {} : { art: aktiv },
    );
    const stand = nachrichtenAblage.zaehle(konfig.guildId);

    res.type('html').send(
      String(
        seite({
          titel: 'Gespeicherte Nachrichten',
          pfad: '/nachrichten',
          stufe: req.stufe,
          sitzung: req.sitzung,
          botStatus: bot.status(),
          inhalt: html`
            <h1>Gespeicherte Nachrichten</h1>
            <p class="unterzeile">
              Was du öfter brauchst, einmal schreiben und wiederverwenden.
            </p>

            ${filterleiste(aktiv, stand)}

            ${eintraege.length === 0
              ? html`<p class="leer">
                  ${stand.gesamt === 0
                    ? html`Noch nichts gespeichert. Im
                        <a href="/nachricht">Nachrichteneditor</a> gibt es unten ein Namensfeld —
                        was dort einen Namen bekommt, landet hier.`
                    : 'Zu diesem Filter gibt es nichts. Die anderen Reiter haben etwas.'}
                </p>`
              : html`<ul class="ablageliste">
                  ${eintraege.map((e) => karte(e, gildenAnsicht, konfig.guildId))}
                </ul>`}
          `,
        }),
      ),
    );
  });
}
