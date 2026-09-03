import { html } from '../html/html.mjs';
import { seite } from '../html/layout.mjs';
import { verlangt } from '../mw/verlangt.mjs';
import { STUFE } from '../../auth/rechte.mjs';
import { csrfFeld } from '../../auth/csrf.mjs';
import { fehlerZu } from '../html/baukasten.mjs';
import { alsZeitpunkt } from '../html/zeit.mjs';
import {
  GRENZE, FARBEN, farbe, leererKnopf, zeilenAufteilung, verschiebe, pruefeLeiste, knopfHatInhalt,
} from '../../aktionen/modell.mjs';

/**
 * Aktionsleisten bauen.
 *
 * Die Vorschau zeigt die Knöpfe so, wie Discord sie umbricht: fünf je Reihe.
 * Wer sechs baut, sieht hier, dass der sechste allein in einer zweiten Reihe
 * landet — und nicht erst, wenn die Nachricht draussen ist.
 *
 * Was ein Knopf *tut*, kommt in den nächsten Schritten dazu. Bis dahin sagt die
 * Vorschau bei jedem Knopf, dass er noch nichts tut; das ist ehrlicher, als es
 * wegzulassen und später zu ergänzen.
 */

function knopfEditor(knopf, i, anzahl, fehler) {
  const gewaehlt = String(knopf.farbe ?? 'grau');

  return html`
    <fieldset class="knopfkasten">
      <legend>Knopf ${i + 1}${i === GRENZE.JE_REIHE ? ' — hier beginnt Reihe 2' : ''}</legend>

      <div class="zeilenwerte">
        <label class="zahlenfeld feld-mittel">
          <span>Beschriftung</span>
          <input type="text" name="beschriftung" value="${knopf.beschriftung ?? ''}"
                 maxlength="${GRENZE.BESCHRIFTUNG}">
        </label>

        <label class="zahlenfeld">
          <span>Emoji</span>
          <input type="text" name="emoji" value="${knopf.emoji ?? ''}" maxlength="32"
                 class="emojifeld" placeholder="🎉">
        </label>

        <label class="zahlenfeld">
          <span>Farbe</span>
          <select name="farbe">
            ${FARBEN.map(
              (f) => html`
                <option value="${f.wert}"${f.wert === gewaehlt ? html` selected` : ''}>${f.name}</option>
              `,
            )}
          </select>
        </label>
      </div>

      <div class="zeilenschalter">
        <button type="submit" name="hoch" value="${i}" class="knopf-leise"
                ${i === 0 ? html`disabled` : ''}>Nach oben</button>
        <button type="submit" name="runter" value="${i}" class="knopf-leise"
                ${i === anzahl - 1 ? html`disabled` : ''}>Nach unten</button>
        <button type="submit" name="knopfEntfernen" value="${i}" class="knopf-leise">
          Knopf entfernen
        </button>
      </div>

      ${fehlerZu(fehler, `knopf${i}`)}
    </fieldset>
  `;
}

/** Die Leiste so, wie Discord sie zeigen würde. */
function leistenVorschau(knoepfe) {
  const reihen = zeilenAufteilung(knoepfe);

  if (knoepfe.length === 0) {
    return html`<p class="leer">Noch kein Knopf. Unten lässt sich einer anlegen.</p>`;
  }

  return html`
    <div class="leistenvorschau">
      ${reihen.map(
        (reihe, r) => html`
          ${reihen.length > 1 ? html`<p class="reihenmarke">Reihe ${r + 1}</p>` : ''}
          <div class="knopfreihe">
            ${reihe.map((knopf) => {
              const f = farbe(knopf.farbe);
              return html`
                <span class="discordknopf discordknopf-${f.wert}">
                  ${knopf.emoji ? html`<span class="knopfemoji">${knopf.emoji}</span>` : ''}
                  ${knopf.beschriftung || (knopf.emoji ? '' : '(ohne Beschriftung)')}
                </span>
              `;
            })}
          </div>
        `,
      )}
    </div>

    ${knoepfe.some((k) => (k.aktionen ?? []).length === 0)
      ? html`<p class="hinweis-warn">
          Knöpfe ohne Aktion tun beim Klicken nichts. Was ein Knopf auslöst, wird in den
          nächsten Schritten einstellbar.
        </p>`
      : ''}
  `;
}

function listeSeite({ req, bot, eintraege }) {
  return seite({
    titel: 'Aktionsleisten',
    pfad: '/aktionsleisten',
    stufe: req.stufe,
    sitzung: req.sitzung,
    botStatus: bot.status(),
    inhalt: html`
      <h1>Aktionsleisten</h1>
      <p class="unterzeile">
        Knöpfe unter einer Nachricht — für Rollen zum Selberholen, Rückfragen oder Hinweise.
      </p>

      <p><a href="/aktionsleisten/neu" class="knopf-haupt">Neue Aktionsleiste</a></p>

      ${eintraege.length === 0
        ? html`<p class="leer">Noch keine Aktionsleiste angelegt.</p>`
        : html`
            <ul class="ablageliste">
              ${eintraege.map(
                (eintrag) => html`
                  <li class="ablagekarte">
                    <div class="ablagekopf">
                      <span class="ablagename">${eintrag.name}</span>
                      <span class="ablageart">${eintrag.knoepfe.length} ${
                        eintrag.knoepfe.length === 1 ? 'Knopf' : 'Knöpfe'
                      }</span>
                    </div>

                    ${eintrag.beschaedigt
                      ? html`<p class="hinweis-warn">
                          Der Inhalt dieser Leiste ist nicht lesbar. Sie lässt sich löschen,
                          aber nicht öffnen.
                        </p>`
                      : html`<div class="farbpunkte">
                          ${eintrag.knoepfe.map((knopf) => {
                            const f = farbe(knopf.farbe);
                            return html`<span class="farbpunkt farbpunkt-${f.wert}"
                                              title="${knopf.beschriftung || knopf.emoji || 'ohne Beschriftung'} — ${f.name}"></span>`;
                          })}
                        </div>`}

                    <p class="ablagefuss">
                      <span class="ablagezeit">Zuletzt geändert ${alsZeitpunkt(eintrag.geaendertAm)}</span>
                    </p>

                    <div class="ablageknoepfe">
                      ${eintrag.beschaedigt
                        ? ''
                        : html`<a href="/aktionsleisten/${eintrag.id}" class="knopf-leise">Öffnen</a>`}
                      <a href="/aktionsleisten/${eintrag.id}/loeschen" class="knopf-leise">Löschen</a>
                    </div>
                  </li>
                `,
              )}
            </ul>
          `}
    `,
  });
}

function editorSeite({ req, bot, entwurf, fehler = [], hinweis = null }) {
  return seite({
    titel: entwurf.id ? 'Aktionsleiste bearbeiten' : 'Neue Aktionsleiste',
    pfad: '/aktionsleisten',
    stufe: req.stufe,
    sitzung: req.sitzung,
    botStatus: bot.status(),
    inhalt: html`
      <h1>${entwurf.id ? 'Aktionsleiste bearbeiten' : 'Neue Aktionsleiste'}</h1>
      <p class="unterzeile">
        Discord bricht nach ${GRENZE.JE_REIHE} Knöpfen in eine neue Reihe um — die Vorschau
        zeigt es genauso.
      </p>

      ${hinweis ? html`<p class="hinweis-gut">${hinweis}</p>` : ''}

      <form method="post" action="/aktionsleisten" class="editor leisteneditor">
        ${csrfFeld(req)}
        ${entwurf.id ? html`<input type="hidden" name="id" value="${entwurf.id}">` : ''}

        <div class="feld feld-mittel">
          <label for="name">Name der Leiste</label>
          <input type="text" id="name" name="name" value="${entwurf.name}" maxlength="${GRENZE.NAME}">
          ${fehlerZu(fehler, 'name')}
        </div>

        <h2>Vorschau</h2>
        ${leistenVorschau(entwurf.knoepfe)}

        <h2>Knöpfe</h2>
        ${entwurf.knoepfe.map((knopf, i) => knopfEditor(knopf, i, entwurf.knoepfe.length, fehler))}
        ${fehlerZu(fehler, 'knoepfe')}

        ${entwurf.knoepfe.length < GRENZE.KNOEPFE
          ? html`<button type="submit" name="knopfHinzufuegen" value="ja" class="knopf-leise">
              Knopf hinzufügen
            </button>`
          : html`<p class="hinweis">
              ${GRENZE.KNOEPFE} Knöpfe sind erreicht — mehr erlaubt Discord je Nachricht nicht.
            </p>`}

        <div class="editorknoepfe">
          <button type="submit" name="sichern" value="ja" class="knopf-haupt">Speichern</button>
          <a href="/aktionsleisten" class="knopf-abbrechen">Abbrechen</a>
        </div>
      </form>
    `,
  });
}

function loeschenSeite({ req, bot, eintrag }) {
  return seite({
    titel: 'Aktionsleiste löschen?',
    pfad: '/aktionsleisten',
    stufe: req.stufe,
    sitzung: req.sitzung,
    botStatus: bot.status(),
    inhalt: html`
      <h1>Aktionsleiste löschen?</h1>
      <div class="rueckfrage">
        <p class="rueckfrage-kern">Die Leiste <strong>${eintrag.name}</strong> wird gelöscht.</p>
        <p class="hinweis">
          Schon verschickte Nachrichten behalten ihre Knöpfe — die tun danach aber nichts mehr.
        </p>
      </div>

      <form method="post" action="/aktionsleisten/${eintrag.id}/loeschen" class="rueckfrage-knoepfe">
        ${csrfFeld(req)}
        <button type="submit" name="bestaetigt" value="ja" class="knopf-haupt">Ja, löschen</button>
        <a href="/aktionsleisten" class="knopf-abbrechen">Abbrechen</a>
      </form>
    `,
  });
}

/** Ein wiederholtes Formularfeld kommt einzeln oder als Liste — immer als Liste behandeln. */
const alsListe = (wert) => (wert === undefined ? [] : Array.isArray(wert) ? wert : [wert]);

export function entwurfAus(koerper = {}) {
  const beschriftungen = alsListe(koerper.beschriftung);
  const emojis = alsListe(koerper.emoji);
  const farben = alsListe(koerper.farbe);

  return {
    id: String(koerper.id ?? '') || null,
    name: String(koerper.name ?? ''),
    knoepfe: beschriftungen.slice(0, GRENZE.KNOEPFE).map((beschriftung, i) => ({
      ...leererKnopf(),
      beschriftung: String(beschriftung ?? ''),
      emoji: String(emojis[i] ?? ''),
      farbe: farbe(farben[i]).wert,
    })),
  };
}

function nichtGefunden(req, bot, res) {
  return res.status(404).type('html').send(
    String(
      seite({
        titel: 'Nicht gefunden',
        pfad: '/aktionsleisten',
        stufe: req.stufe,
        sitzung: req.sitzung,
        botStatus: bot.status(),
        inhalt: html`
          <h1>Diese Aktionsleiste gibt es nicht</h1>
          <p>Vielleicht gehört sie zu einem anderen Server, oder sie wurde gelöscht.</p>
          <p><a href="/aktionsleisten">Zurück zu den Aktionsleisten</a></p>
        `,
      }),
    ),
  );
}

export function registriereAktionsleisten(app, { bot, konfig, aktionsleisten }) {
  const zeige = (req, res, entwurf, { fehler = [], hinweis = null, lage = 200 } = {}) =>
    res.status(lage).type('html').send(String(editorSeite({ req, bot, entwurf, fehler, hinweis })));

  app.get('/aktionsleisten', verlangt(STUFE.MODERATOR), (req, res) => {
    res.type('html').send(
      String(listeSeite({ req, bot, eintraege: aktionsleisten.alle(konfig.guildId) })),
    );
  });

  // Vor `/aktionsleisten/:id`, sonst wäre „neu“ eine Kennung.
  app.get('/aktionsleisten/neu', verlangt(STUFE.MODERATOR), (req, res) =>
    zeige(req, res, { id: null, name: '', knoepfe: [leererKnopf()] }),
  );

  app.get('/aktionsleisten/:id/loeschen', verlangt(STUFE.MODERATOR), (req, res) => {
    const eintrag = aktionsleisten.lies(konfig.guildId, Number(req.params.id));
    if (!eintrag) return nichtGefunden(req, bot, res);
    return res.type('html').send(String(loeschenSeite({ req, bot, eintrag })));
  });

  app.post('/aktionsleisten/:id/loeschen', verlangt(STUFE.MODERATOR), (req, res) => {
    const eintrag = aktionsleisten.lies(konfig.guildId, Number(req.params.id));
    if (!eintrag) return nichtGefunden(req, bot, res);

    if (req.body?.bestaetigt !== 'ja') {
      return res.status(422).type('html').send(String(loeschenSeite({ req, bot, eintrag })));
    }

    aktionsleisten.loesche(konfig.guildId, eintrag.id);
    return res.redirect(303, '/aktionsleisten');
  });

  app.get('/aktionsleisten/:id', verlangt(STUFE.MODERATOR), (req, res) => {
    const eintrag = aktionsleisten.lies(konfig.guildId, Number(req.params.id));
    if (!eintrag || eintrag.beschaedigt) return nichtGefunden(req, bot, res);

    return zeige(req, res, {
      id: String(eintrag.id),
      name: eintrag.name,
      knoepfe: eintrag.knoepfe.length > 0 ? eintrag.knoepfe : [leererKnopf()],
    });
  });

  app.post('/aktionsleisten', verlangt(STUFE.MODERATOR), (req, res) => {
    const koerper = req.body ?? {};
    const entwurf = entwurfAus(koerper);

    if (koerper.knopfHinzufuegen !== undefined) {
      if (entwurf.knoepfe.length < GRENZE.KNOEPFE) entwurf.knoepfe.push(leererKnopf());
      return zeige(req, res, entwurf);
    }

    if (koerper.knopfEntfernen !== undefined) {
      const index = Number(koerper.knopfEntfernen);
      if (Number.isInteger(index) && index >= 0 && index < entwurf.knoepfe.length) {
        entwurf.knoepfe.splice(index, 1);
      }
      return zeige(req, res, entwurf);
    }

    for (const [name, richtung] of [['hoch', -1], ['runter', 1]]) {
      if (koerper[name] !== undefined) {
        entwurf.knoepfe = verschiebe(entwurf.knoepfe, Number(koerper[name]), richtung);
        return zeige(req, res, entwurf);
      }
    }

    const geprueft = pruefeLeiste(entwurf);
    if (!geprueft.ok) return zeige(req, res, entwurf, { fehler: geprueft.fehler, lage: 422 });

    // Nur Knöpfe mit Inhalt werden gespeichert — leere sind an der Prüfung
    // ohnehin schon gescheitert.
    const knoepfe = entwurf.knoepfe.filter(knopfHatInhalt);

    if (entwurf.id) {
      const geaendert = aktionsleisten.aendere(konfig.guildId, Number(entwurf.id), {
        name: geprueft.name, knoepfe,
      });
      if (!geaendert) return nichtGefunden(req, bot, res);
    } else {
      aktionsleisten.lege(konfig.guildId, { name: geprueft.name, knoepfe });
    }

    return res.redirect(303, '/aktionsleisten');
  });
}
