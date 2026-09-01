import { html } from '../html/html.mjs';
import { seite } from '../html/layout.mjs';
import { verlangt } from '../mw/verlangt.mjs';
import { STUFE } from '../../auth/rechte.mjs';
import { csrfFeld } from '../../auth/csrf.mjs';
import { GRENZE, ART, leeresEmbed } from '../../nachricht/modell.mjs';
import { embedEditor } from '../html/embed.mjs';
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

/** Ein wiederholtes Formularfeld kommt einzeln oder als Liste — immer als Liste behandeln. */
const alsListe = (wert) => (wert === undefined ? [] : Array.isArray(wert) ? wert : [wert]);

/**
 * Baut den Entwurf aus dem Formularkoerper.
 *
 * Jede Seitenaktion (Reiter wechseln, Platzhalter einfuegen, Feld hinzufuegen)
 * geht durch dieselbe Funktion. Dadurch gibt es genau einen Ort, an dem aus
 * Formulardaten ein Entwurf wird — und keine Aktion, die versehentlich etwas
 * vergisst.
 */
function entwurfAus(koerper = {}) {
  const namen = alsListe(koerper.embedFeldName);
  const werte = alsListe(koerper.embedFeldWert);

  return {
    art: koerper.art === ART.KANAL ? ART.KANAL : ART.DM,
    text: String(koerper.text ?? ''),
    embedAn: koerper.embedAn === 'ja',
    embed: {
      ...leeresEmbed(),
      titel: String(koerper.embedTitel ?? ''),
      beschreibung: String(koerper.embedBeschreibung ?? ''),
      fusszeile: String(koerper.embedFusszeile ?? ''),
      autor: String(koerper.embedAutor ?? ''),
      farbe: String(koerper.embedFarbe ?? '') || null,
      felder: namen.map((name, i) => ({ name: String(name), wert: String(werte[i] ?? '') })),
    },
  };
}

/** Der Entwurf in der Form, die pruefeNachricht erwartet. */
function alsEingabe(entwurf) {
  return {
    art: entwurf.art,
    text: entwurf.text,
    embedAn: entwurf.embedAn ? 'ja' : 'nein',
    embedTitel: entwurf.embed.titel,
    embedBeschreibung: entwurf.embed.beschreibung,
    embedFusszeile: entwurf.embed.fusszeile,
    embedAutor: entwurf.embed.autor,
    embedFarbe: entwurf.embed.farbe ?? '',
    embedFelder: entwurf.embed.felder,
  };
}

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
  const zuFeld = (feld) => fehlerZu(fehler, feld);

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

        ${entwurf.embedAn
          ? embedEditor({ embed: entwurf.embed, fehlerZu: zuFeld })
          : html`
              <div class="embed-anbieten">
                <button type="submit" name="embedUmschalten" value="ja" class="knopf-leise">
                  Embed-Karte anhängen
                </button>
              </div>
            `}

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
    const entwurf = entwurfAus({ art: req.query.art });
    res.type('html').send(String(editorSeite({ req, bot, entwurf })));
  });

  app.post('/nachricht', verlangt(STUFE.MODERATOR), (req, res) => {
    const koerper = req.body ?? {};
    const entwurf = entwurfAus(koerper);
    const zeigen = () => res.type('html').send(String(editorSeite({ req, bot, entwurf })));

    // Reiter gewechselt: dasselbe Formular, anderes Ziel, gleicher Inhalt.
    if (koerper.wechselZu === ART.DM || koerper.wechselZu === ART.KANAL) {
      entwurf.art = koerper.wechselZu;
      return zeigen();
    }

    if (koerper.embedUmschalten !== undefined) {
      entwurf.embedAn = !entwurf.embedAn;
      return zeigen();
    }

    if (koerper.feldHinzufuegen !== undefined) {
      if (entwurf.embed.felder.length < GRENZE.FELDER) {
        entwurf.embed.felder.push({ name: '', wert: '' });
      }
      return zeigen();
    }

    if (koerper.feldEntfernen !== undefined) {
      const index = Number(koerper.feldEntfernen);
      if (Number.isInteger(index) && index >= 0 && index < entwurf.embed.felder.length) {
        entwurf.embed.felder.splice(index, 1);
      }
      return zeigen();
    }

    // Platzhalter angehaengt. Ohne JavaScript ans Textende — mit JavaScript
    // setzt editor.js ihn an die Schreibmarke, bevor es hierher kommt.
    if (koerper.platzhalterEinfuegen !== undefined) {
      const platzhalter = String(koerper.platzhalterEinfuegen);
      if (ERLAUBTE_PLATZHALTER.has(platzhalter)) entwurf.text += platzhalter;
      return zeigen();
    }

    const geprueft = pruefeNachricht(alsEingabe(entwurf));
    if (!geprueft.ok) {
      return res
        .status(422)
        .type('html')
        .send(String(editorSeite({ req, bot, entwurf, fehler: geprueft.fehler })));
    }

    return zeigen();
  });
}
