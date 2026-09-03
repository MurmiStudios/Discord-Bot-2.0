import { html } from '../html/html.mjs';
import { seite } from '../html/layout.mjs';
import { verlangt } from '../mw/verlangt.mjs';
import { STUFE } from '../../auth/rechte.mjs';
import { ART } from '../../nachricht/modell.mjs';
import { entwurfAus, auszug } from '../../nachricht/entwurf.mjs';
import { alsZeitpunkt } from '../html/zeit.mjs';
import { csrfFeld } from '../../auth/csrf.mjs';

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

/**
 * Umbenennen, Art wechseln, Notiz — eingeklappt.
 *
 * Eingeklappt, weil es die selteneren Handgriffe sind: Die Liste soll man
 * überfliegen können. Ein `details`-Element braucht dafür kein JavaScript und
 * bleibt ohne es genauso bedienbar.
 */
function kartenformular(req, eintrag) {
  return html`
    <details class="ablagedetails">
      <summary>Bearbeiten</summary>
      <form method="post" action="/nachrichten/${eintrag.id}" class="ablageform">
        ${csrfFeld(req)}

        <div class="feld feld-schmal">
          <label for="name-${eintrag.id}">Name</label>
          <input type="text" id="name-${eintrag.id}" name="name" value="${eintrag.name}" maxlength="80">
        </div>

        <div class="feld feld-schmal">
          <label for="art-${eintrag.id}">Art</label>
          <select id="art-${eintrag.id}" name="art">
            <option value="${ART.DM}"${eintrag.art === ART.DM ? html` selected` : ''}>Direktnachricht</option>
            <option value="${ART.KANAL}"${eintrag.art === ART.KANAL ? html` selected` : ''}>Kanal</option>
          </select>
        </div>

        <div class="feld">
          <label for="notiz-${eintrag.id}">Notiz</label>
          <textarea id="notiz-${eintrag.id}" name="notiz" rows="2"
                    placeholder="Wofür ist das? Wann benutzt du es?">${eintrag.notiz}</textarea>
        </div>

        <div class="editor-fuss">
          <button type="submit" name="sichern" value="ja" class="knopf-leise">Übernehmen</button>
        </div>
      </form>
    </details>
  `;
}

function karte(req, eintrag, gildenAnsicht, guildId) {
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

      ${eintrag.notiz.trim() !== '' ? html`<p class="ablagenotiz">${eintrag.notiz}</p>` : ''}

      <p class="ablagefuss">
        <span class="ablageziel">${zielText(eintrag, gildenAnsicht, guildId)}</span>
        <span class="ablagezeit">Zuletzt geändert ${alsZeitpunkt(eintrag.geaendertAm)}</span>
      </p>

      <div class="ablageknoepfe">
        ${eintrag.beschaedigt
          ? ''
          : html`<a href="/nachricht?laden=${eintrag.id}" class="knopf-leise">Öffnen</a>`}
        <form method="post" action="/nachrichten/${eintrag.id}/kopie">
          ${csrfFeld(req)}
          <button type="submit" class="knopf-leise">Kopie</button>
        </form>
        <a href="/nachrichten/${eintrag.id}/loeschen" class="knopf-leise">Löschen</a>
      </div>

      ${eintrag.beschaedigt ? '' : kartenformular(req, eintrag)}
    </li>
  `;
}

function loeschenSeite({ req, bot, eintrag }) {
  return seite({
    titel: 'Nachricht löschen?',
    pfad: '/nachrichten',
    stufe: req.stufe,
    sitzung: req.sitzung,
    botStatus: bot.status(),
    inhalt: html`
      <h1>Nachricht löschen?</h1>
      <div class="rueckfrage">
        <p class="rueckfrage-kern">
          Die gespeicherte Nachricht <strong>${eintrag.name}</strong> wird gelöscht.
        </p>
        <p class="hinweis">
          Das betrifft nur die Ablage — schon verschickte Nachrichten bleiben, wo sie sind.
          Rückgängig machen lässt es sich nicht.
        </p>
      </div>

      <form method="post" action="/nachrichten/${eintrag.id}/loeschen" class="rueckfrage-knoepfe">
        ${csrfFeld(req)}
        <button type="submit" name="bestaetigt" value="ja" class="knopf-haupt">Ja, löschen</button>
        <a href="/nachrichten" class="knopf-abbrechen">Abbrechen</a>
      </form>
    `,
  });
}

function nichtGefunden(req, bot, res) {
  return res.status(404).type('html').send(
    String(
      seite({
        titel: 'Nicht gefunden',
        pfad: '/nachrichten',
        stufe: req.stufe,
        sitzung: req.sitzung,
        botStatus: bot.status(),
        inhalt: html`
          <h1>Diese gespeicherte Nachricht gibt es nicht</h1>
          <p>Vielleicht gehört sie zu einem anderen Server, oder sie wurde gelöscht.</p>
          <p><a href="/nachrichten">Zurück zur Liste</a></p>
        `,
      }),
    ),
  );
}

export function registriereNachrichten(app, { bot, konfig, nachrichtenAblage, gildenAnsicht }) {
  registriereKartenaktionen(app, { bot, konfig, nachrichtenAblage });

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
                  ${eintraege.map((e) => karte(req, e, gildenAnsicht, konfig.guildId))}
                </ul>`}
          `,
        }),
      ),
    );
  });
}

/** Die Routen, die eine einzelne Karte braucht. */
function registriereKartenaktionen(app, { bot, konfig, nachrichtenAblage }) {
  const lies = (req) => {
    const kennung = Number(req.params.id);
    return Number.isInteger(kennung)
      ? nachrichtenAblage.lies(konfig.guildId, kennung)
      : undefined;
  };

  app.post('/nachrichten/:id/kopie', verlangt(STUFE.MODERATOR), (req, res) => {
    const eintrag = lies(req);
    if (!eintrag) return nichtGefunden(req, bot, res);

    // Eine echte Kopie, kein Verweis: Wer sie ändert, ändert das Original nicht.
    nachrichtenAblage.lege(konfig.guildId, {
      name: `${eintrag.name} (Kopie)`.slice(0, 80),
      art: eintrag.art,
      notiz: eintrag.notiz,
      daten: eintrag.daten,
    });
    return res.redirect(303, `/nachrichten?art=${eintrag.art}`);
  });

  app.get('/nachrichten/:id/loeschen', verlangt(STUFE.MODERATOR), (req, res) => {
    const eintrag = lies(req);
    if (!eintrag) return nichtGefunden(req, bot, res);
    return res.type('html').send(String(loeschenSeite({ req, bot, eintrag })));
  });

  app.post('/nachrichten/:id/loeschen', verlangt(STUFE.MODERATOR), (req, res) => {
    const eintrag = lies(req);
    if (!eintrag) return nichtGefunden(req, bot, res);

    if (req.body?.bestaetigt !== 'ja') {
      return res.status(422).type('html').send(String(loeschenSeite({ req, bot, eintrag })));
    }

    nachrichtenAblage.loesche(konfig.guildId, eintrag.id);
    return res.redirect(303, '/nachrichten');
  });

  app.post('/nachrichten/:id', verlangt(STUFE.MODERATOR), (req, res) => {
    const eintrag = lies(req);
    if (!eintrag) return nichtGefunden(req, bot, res);

    const koerper = req.body ?? {};
    const name = String(koerper.name ?? '').trim() || eintrag.name;
    const art = koerper.art === ART.KANAL ? ART.KANAL : ART.DM;

    // Die Art steht in der Spalte und im Inhalt. Nur eins von beidem zu ändern
    // hiesse: Die Liste sagt „Kanal", der Editor öffnet eine Direktnachricht.
    nachrichtenAblage.aendere(konfig.guildId, eintrag.id, {
      name,
      art,
      notiz: String(koerper.notiz ?? ''),
      daten: { ...eintrag.daten, art },
    });
    return res.redirect(303, `/nachrichten?art=${art}`);
  });
}
