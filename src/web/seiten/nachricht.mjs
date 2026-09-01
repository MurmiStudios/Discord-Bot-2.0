import { html } from '../html/html.mjs';
import { seite } from '../html/layout.mjs';
import { verlangt } from '../mw/verlangt.mjs';
import { STUFE } from '../../auth/rechte.mjs';
import { csrfFeld } from '../../auth/csrf.mjs';
import { GRENZE, ART } from '../../nachricht/modell.mjs';
import { PLATZHALTER } from '../../nachricht/platzhalter.mjs';
import { pruefeNachricht } from '../../nachricht/pruefen.mjs';

/**
 * Der Nachrichteneditor.
 *
 * Zum Ziel-Wechsel: Das Artifact nennt die Reiter „echte Verweise", verlangt
 * aber im selben Atemzug, dass der Wechsel den getippten Text behält. Beides
 * zusammen geht mit einem Verweis nicht — ein Text von 2000 Zeichen passt
 * nicht verlässlich in eine Adresse.
 *
 * Deshalb sind die Reiter Absende-Knöpfe desselben Formulars: Sie funktionieren
 * ohne JavaScript, und der Text geht im Formularkörper mit. Die Adresse
 * `/nachricht?art=kanal` funktioniert zusätzlich, damit sich ein Ziel verlinken
 * und als Lesezeichen ablegen lässt.
 */

const ERLAUBTE_PLATZHALTER = new Set(PLATZHALTER.map((p) => p.name));

function reiter(art) {
  const eintraege = [
    { wert: ART.DM, name: 'Direktnachricht' },
    { wert: ART.KANAL, name: 'Kanal' },
  ];

  return html`
    <div class="reiter" role="tablist">
      ${eintraege.map(
        (eintrag) => html`
          <button
            type="submit"
            name="wechselZu"
            value="${eintrag.wert}"
            role="tab"
            aria-selected="${eintrag.wert === art ? 'true' : 'false'}"
            class="reiter-knopf${eintrag.wert === art ? ' reiter-aktiv' : ''}"
          >${eintrag.name}</button>
        `,
      )}
    </div>
  `;
}

function fehlerZu(fehler, feld) {
  const treffer = fehler.filter((f) => f.feld === feld);
  if (treffer.length === 0) return '';
  return html`<p class="feldfehler" role="alert">${treffer.map((f) => html`${f.meldung} `)}</p>`;
}

function editorSeite({ req, bot, entwurf, fehler = [] }) {
  const laenge = entwurf.text.length;

  return seite({
    titel: 'Nachricht',
    pfad: '/nachricht',
    stufe: req.stufe,
    sitzung: req.sitzung,
    botStatus: bot.status(),
    inhalt: html`
      <h1>Nachricht</h1>
      <p class="unterzeile">
        Direktnachricht und Kanal auf einer Seite. Der Wechsel behält den getippten Text.
      </p>

      <form method="post" action="/nachricht" class="editor">
        ${csrfFeld(req)}
        <input type="hidden" name="art" value="${entwurf.art}">

        ${reiter(entwurf.art)}

        <div class="feld">
          <label for="text">
            Text
            <span class="zaehler" data-zaehler-fuer="text" data-grenze="${GRENZE.TEXT}">
              ${laenge} / ${GRENZE.TEXT}
            </span>
          </label>
          <textarea id="text" name="text" rows="8" maxlength="${GRENZE.TEXT * 2}">${entwurf.text}</textarea>
          ${fehlerZu(fehler, 'text')}
        </div>

        <div class="platzhalterreihe">
          <span class="platzhalter-titel">Platzhalter einfügen</span>
          ${PLATZHALTER.map(
            (platzhalter) => html`
              <button
                type="submit"
                name="platzhalterEinfuegen"
                value="${platzhalter.name}"
                class="platzhalter-knopf"
                title="${platzhalter.erklaerung}"
              >${platzhalter.name}</button>
            `,
          )}
        </div>

        <div class="editor-fuss">
          <button type="submit" name="pruefen" value="ja" class="knopf-haupt">Prüfen</button>
          <span class="hinweis">Versand und Empfängerauswahl folgen in den nächsten Schritten.</span>
        </div>
      </form>
    `,
    skripte: ['/editor.js'],
  });
}

export function registriereNachricht(app, { bot }) {
  // Alte Adressen bleiben gueltig.
  app.get('/dm', verlangt(STUFE.MODERATOR), (_req, res) => res.redirect(301, '/nachricht?art=dm'));
  app.get('/kanaele', verlangt(STUFE.MODERATOR), (_req, res) =>
    res.redirect(301, '/nachricht?art=kanal'),
  );

  app.get('/nachricht', verlangt(STUFE.MODERATOR), (req, res) => {
    const art = req.query.art === ART.KANAL ? ART.KANAL : ART.DM;
    res.type('html').send(String(editorSeite({ req, bot, entwurf: { art, text: '' } })));
  });

  app.post('/nachricht', verlangt(STUFE.MODERATOR), (req, res) => {
    const koerper = req.body ?? {};
    let art = koerper.art === ART.KANAL ? ART.KANAL : ART.DM;
    let text = String(koerper.text ?? '');

    // Reiter gewechselt: dasselbe Formular, anderes Ziel, gleicher Text.
    if (koerper.wechselZu === ART.DM || koerper.wechselZu === ART.KANAL) {
      art = koerper.wechselZu;
      return res.type('html').send(String(editorSeite({ req, bot, entwurf: { art, text } })));
    }

    // Platzhalter angehaengt. Ohne JavaScript ans Textende — mit JavaScript
    // setzt editor.js ihn an die Schreibmarke, bevor es hierher kommt.
    if (koerper.platzhalterEinfuegen !== undefined) {
      const platzhalter = String(koerper.platzhalterEinfuegen);
      if (ERLAUBTE_PLATZHALTER.has(platzhalter)) text += platzhalter;
      return res.type('html').send(String(editorSeite({ req, bot, entwurf: { art, text } })));
    }

    const geprueft = pruefeNachricht({ art, text });
    if (!geprueft.ok) {
      return res
        .status(422)
        .type('html')
        .send(String(editorSeite({ req, bot, entwurf: { art, text }, fehler: geprueft.fehler })));
    }

    return res.type('html').send(String(editorSeite({ req, bot, entwurf: { art, text } })));
  });
}
