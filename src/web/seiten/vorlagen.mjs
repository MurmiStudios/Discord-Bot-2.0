import { html } from '../html/html.mjs';
import { seite } from '../html/layout.mjs';
import { verlangt } from '../mw/verlangt.mjs';
import { vorschauGrenze } from '../mw/sicherheit.mjs';
import { STUFE } from '../../auth/rechte.mjs';
import { csrfFeld } from '../../auth/csrf.mjs';
import { platzhalterreihe } from '../html/platzhalterreihe.mjs';
import { alsZeitpunkt } from '../html/zeit.mjs';
import { zerlegeKnopfwert } from '../../nachricht/platzhalterziel.mjs';
import { PLATZHALTER } from '../../nachricht/platzhalter.mjs';
import { FORMATE, rendere, standardVorlage } from '../../bilder/renderer.mjs';
import { beispielDaten } from '../../bilder/beispiel.mjs';
import { platzhalterWerte } from '../../nachricht/werte.mjs';
import { alsGroesse, bildPfad, pruefeUpload, UploadFehler } from '../../bilder/upload.mjs';
import {
  GRENZE_VORLAGE, FORMEN, ANPASSUNGEN, AUSRICHTUNGEN, FORMATNAMEN,
  vorlageAus, neueZeile, pruefeVorlage, sichereVorlage,
} from '../../bilder/vorlage.mjs';

/**
 * Bildvorlagen.
 *
 * Die Vorschau kommt vom Server und aus demselben Renderer, der später die
 * echten Bilder baut. Das ist die eigentliche Entscheidung dieser Seite: Eine
 * im Browser nachgebaute Vorschau wäre flüssiger, würde aber irgendwann etwas
 * anderes zeigen als das, was beim Empfänger ankommt — und dann ist die
 * Vorschau schlimmer als keine.
 *
 * Sie steckt als `data:`-Adresse direkt im Bild-Element, statt über eine
 * zweite Anfrage zu kommen. Damit stimmt sie ohne JavaScript immer mit dem
 * Formular überein, und es gibt keinen Zwischenspeicher, der veralten kann.
 * `vorlagen.js` benutzt zusätzlich den POST-Weg, um beim Tippen nachzuziehen.
 *
 * Verschieben in der Vorschau (`ziehen.js`) ist eine Zugabe, kein Eingabeweg:
 * Die Zahlenfelder bleiben vollwertig, und ohne JavaScript entstehen die Griffe
 * gar nicht erst.
 *
 * Das Namensfeld trägt bewusst kein `required`: Die Browserprüfung blockiert
 * nicht nur „Speichern“, sondern jeden Absende-Knopf des Formulars. Eine Zeile
 * hinzufügen oder ein Hintergrundbild hochladen ginge dann erst, nachdem ein
 * Name dasteht. Geprüft wird der Name auf dem Server — dort, wo die Prüfung
 * ohnehin verbindlich ist.
 */

const ERLAUBTE_PLATZHALTER = new Set(PLATZHALTER.map((p) => p.name));
const ZEILENZIEL = /^zeile(\d+)$/;

const FORMAT_NAMEN = Object.freeze({
  breit: 'Breit — 1200 × 400',
  quadratisch: 'Quadratisch — 600 × 600',
  banner: 'Banner — 1200 × 300',
  eigen: 'Eigene Grösse',
});

const FORM_NAMEN = Object.freeze({ rund: 'Rund', abgerundet: 'Abgerundet', eckig: 'Eckig' });
const ANPASSUNG_NAMEN = Object.freeze({
  fuellen: 'Füllen (Rand wird abgeschnitten)',
  einpassen: 'Einpassen (Rand bleibt frei)',
  strecken: 'Strecken (verzerrt)',
});
const AUSRICHTUNG_NAMEN = Object.freeze({ links: 'Links', mitte: 'Mitte', rechts: 'Rechts' });

/** Der Entwurf, wie ihn jede Aktion dieser Seite liest. */
function entwurfAus(koerper = {}) {
  return {
    id: String(koerper.id ?? '') || null,
    name: String(koerper.name ?? ''),
    // Nur für die Vorschau, nicht Teil der Vorlage: `vorlageAus` liest beides
    // nicht, damit es auch nicht versehentlich mitgespeichert wird.
    mitgliedId: String(koerper.vorschauMitgliedId ?? '') || null,
    suche: String(koerper.vorschauSuche ?? ''),
    vorlage: vorlageAus(koerper),
  };
}

/**
 * Rendert die Vorschau eines Entwurfs.
 *
 * Nur `sichereVorlage` geht in den Renderer, und der Hintergrundpfad entsteht
 * ausschliesslich aus einem geprüften Ablagenamen — ein Feldwert wird hier
 * nirgends zu einem Pfad.
 */
/**
 * Womit die Vorschau gefüllt wird.
 *
 * Ohne gewähltes Mitglied Beispieldaten, sonst das echte Profil aus dem
 * Guild-Cache. Lässt sich das Profilbild nicht laden, bleibt es leer und die
 * Seite sagt es — ein untergeschobenes Ersatzbild sähe aus, als hätte es
 * geklappt.
 */
async function vorschauDaten({ mitgliedId, gildenAnsicht, konfig, avatarQuelle }) {
  const mitglied = mitgliedId ? gildenAnsicht.findeMitglied(mitgliedId, konfig.guildId) : undefined;
  if (!mitglied) return { daten: beispielDaten(), mitglied: undefined, avatarFehlt: false };

  const rolle = gildenAnsicht
    .rollen(konfig.guildId)
    .find((r) => mitglied.rollenIds.includes(r.id));

  const avatarBild = await avatarQuelle.fuer(mitglied.avatarUrl);

  return {
    daten: {
      ...platzhalterWerte({
        nutzer: mitglied,
        gilde: gildenAnsicht.gildenInfo(konfig.guildId),
        rolle: rolle?.name,
      }),
      avatarBild,
    },
    mitglied,
    avatarFehlt: avatarBild === null,
  };
}

async function vorschauBild(vorlage, bilderVerzeichnis, daten) {
  return rendere(
    { ...sichereVorlage(vorlage), hintergrundBild: bildPfad(bilderVerzeichnis, vorlage.hintergrundBild) },
    daten,
  );
}

const alsDatenAdresse = (png) => `data:image/png;base64,${png.toString('base64')}`;

function auswahl(name, wert, erlaubt, namen, { id } = {}) {
  return html`
    <select id="${id ?? name}" name="${name}">
      ${erlaubt.map(
        (eintrag) => html`
          <option value="${eintrag}"${eintrag === wert ? html` selected` : ''}>${namen[eintrag]}</option>
        `,
      )}
    </select>
  `;
}

/**
 * Ein Ankreuzfeld, das auch dann etwas schickt, wenn es nicht angekreuzt ist.
 *
 * Ohne das versteckte Feld davor liesse sich ein Haken nie wieder entfernen:
 * Der Browser schickt ein leeres Ankreuzfeld gar nicht mit, und der Server
 * könnte „nicht angekreuzt“ nicht von „Feld gibt es nicht“ unterscheiden.
 */
function haken(name, an, beschriftung) {
  return html`
    <label class="haken">
      <input type="hidden" name="${name}" value="nein">
      <input type="checkbox" name="${name}" value="ja"${an ? html` checked` : ''}>
      ${beschriftung}
    </label>
  `;
}

function zahlenfeld(name, wert, { beschriftung, min, max, schritt = 1, id }) {
  const kennung = id ?? name;
  return html`
    <label class="zahlenfeld">
      <span>${beschriftung}</span>
      <input type="number" id="${kennung}" name="${name}" value="${wert}"
             min="${min}" max="${max}" step="${schritt}">
    </label>
  `;
}

function fehlerZu(fehler, feld) {
  const treffer = fehler.filter((f) => f.feld === feld);
  if (treffer.length === 0) return '';
  return html`<p class="feldfehler" role="alert">${treffer.map((f) => html`${f.meldung} `)}</p>`;
}

function zeilenEditor(vorlage, fehler) {
  return html`
    <h2>Textzeilen</h2>
    ${vorlage.zeilen.length === 0
      ? html`<p class="leer">Noch keine Textzeile. Ohne Text zeigt die Vorlage nur Hintergrund und Profilbild.</p>`
      : ''}

    ${vorlage.zeilen.map(
      (zeile, i) => html`
        <fieldset class="zeile">
          <legend>Zeile ${i + 1}</legend>

          <div class="feld">
            <label for="zeileText${i}">Text</label>
            <input type="text" id="zeileText${i}" name="zeileText" value="${zeile.text}"
                   maxlength="${GRENZE_VORLAGE.ZEILENTEXT}" data-platzhalter-ziel="zeile${i}">
          </div>
          ${platzhalterreihe(`zeile${i}`)}

          <div class="zeilenwerte">
            ${zahlenfeld('zeileX', zeile.x, { beschriftung: 'X', min: -4096, max: 8192, id: `zeileX${i}` })}
            ${zahlenfeld('zeileY', zeile.y, { beschriftung: 'Y', min: -4096, max: 8192, id: `zeileY${i}` })}
            ${zahlenfeld('zeileGroesse', zeile.groesse, {
              beschriftung: 'Grösse',
              min: GRENZE_VORLAGE.SCHRIFT_MIN,
              max: GRENZE_VORLAGE.SCHRIFT_MAX,
              id: `zeileGroesse${i}`,
            })}
            ${zahlenfeld('zeileMaxBreite', zeile.maxBreite, {
              beschriftung: 'Max. Breite',
              min: 0,
              max: GRENZE_VORLAGE.KANTE_MAX,
              id: `zeileMaxBreite${i}`,
            })}

            <label class="zahlenfeld">
              <span>Farbe</span>
              <input type="color" name="zeileFarbe" value="${zeile.farbe}" aria-label="Farbe von Zeile ${i + 1}">
            </label>

            <label class="zahlenfeld">
              <span>Ausrichtung</span>
              ${auswahl('zeileAusrichtung', zeile.ausrichtung, AUSRICHTUNGEN, AUSRICHTUNG_NAMEN, {
                id: `zeileAusrichtung${i}`,
              })}
            </label>
          </div>

          <div class="zeilenschalter">
            <label class="haken">
              <input type="checkbox" name="zeileFett" value="${i}"${zeile.fett ? html` checked` : ''}>
              Fett
            </label>
            <label class="haken">
              <input type="checkbox" name="zeileSchatten" value="${i}"${zeile.schatten ? html` checked` : ''}>
              Schatten
            </label>
            <button type="submit" name="zeileEntfernen" value="${i}" class="knopf-leise">
              Zeile entfernen
            </button>
          </div>

          ${fehlerZu(fehler, `zeile${i}`)}
        </fieldset>
      `,
    )}

    ${vorlage.zeilen.length < GRENZE_VORLAGE.ZEILEN
      ? html`<button type="submit" name="zeileHinzufuegen" value="ja" class="knopf-leise">Zeile hinzufügen</button>`
      : html`<p class="hinweis">Mehr als ${GRENZE_VORLAGE.ZEILEN} Zeilen sind nicht vorgesehen.</p>`}
    ${fehlerZu(fehler, 'zeilen')}
  `;
}

/**
 * Wessen Name und Profilbild die Vorschau zeigt.
 *
 * Beispieldaten sind der Ausgangspunkt, weil sie ohne Server funktionieren und
 * jeden Platzhalter abdecken. Ein echtes Profil beantwortet dafür die Frage,
 * die Beispieldaten offenlassen: Passt das Bild auch bei diesem Namen?
 */
function mitgliedswahl({ entwurf, treffer, gewaehlt, avatarFehlt }) {
  return html`
    <div class="vorschaudaten">
      <input type="hidden" name="vorschauMitgliedId" value="${entwurf.mitgliedId ?? ''}">

      ${gewaehlt
        ? html`
            <p class="vorschaudaten-kopf">
              Vorschau mit <strong>${gewaehlt.name}</strong>
              <button type="submit" name="vorschauMitgliedLoesen" value="ja" class="knopf-leise">
                Beispieldaten benutzen
              </button>
            </p>
            ${avatarFehlt
              ? html`<p class="hinweis-warn">
                  Das Profilbild liess sich nicht von Discord laden. Name und Zahlen stimmen,
                  das Bild fehlt.
                </p>`
              : ''}
          `
        : html`
            <div class="feld feld-mittel">
              <label for="vorschauSuche">Vorschau mit einem echten Mitglied</label>
              <input type="search" id="vorschauSuche" name="vorschauSuche"
                     value="${entwurf.suche}" placeholder="Name suchen">
            </div>
            <button type="submit" name="vorschauSuchen" value="ja" class="knopf-leise">Suchen</button>

            ${entwurf.suche.trim() !== '' && treffer.length === 0
              ? html`<p class="hinweis">Niemand gefunden.</p>`
              : ''}

            ${treffer.length > 0
              ? html`
                  <div class="mitgliedtreffer" role="group" aria-label="Gefundene Mitglieder">
                    ${treffer.map(
                      (m) => html`
                        <button type="submit" name="vorschauMitglied" value="${m.id}" class="mitgliedknopf">
                          ${m.name}
                        </button>
                      `,
                    )}
                  </div>
                `
              : ''}
          `}
    </div>
  `;
}

function editorSeite({ req, bot, entwurf, vorschau, treffer = [], gewaehlt, avatarFehlt = false, fehler = [], hinweis = null }) {
  const { vorlage } = entwurf;
  const masse = FORMATE[vorlage.format] ?? { breite: vorlage.breite, hoehe: vorlage.hoehe };

  return seite({
    titel: entwurf.id ? 'Bildvorlage bearbeiten' : 'Neue Bildvorlage',
    pfad: '/vorlagen',
    stufe: req.stufe,
    sitzung: req.sitzung,
    botStatus: bot.status(),
    inhalt: html`
      <h1>${entwurf.id ? 'Bildvorlage bearbeiten' : 'Neue Bildvorlage'}</h1>
      <p class="unterzeile">
        Die Vorschau kommt vom Server — sie zeigt genau das Bild, das später verschickt wird.
      </p>

      ${hinweis ? html`<p class="hinweis">${hinweis}</p>` : ''}

      <form method="post" action="/vorlagen" enctype="multipart/form-data" class="editor vorlageneditor">
        ${csrfFeld(req)}
        ${entwurf.id ? html`<input type="hidden" name="id" value="${entwurf.id}">` : ''}

        <div class="feld">
          <label for="name">Name der Vorlage</label>
          <input type="text" id="name" name="name" value="${entwurf.name}"
                 maxlength="${GRENZE_VORLAGE.NAME}">
          ${fehlerZu(fehler, 'name')}
        </div>

        <h2>Format</h2>
        <div class="feld">
          <label for="format">Grösse</label>
          ${auswahl('format', vorlage.format, FORMATNAMEN, FORMAT_NAMEN)}
        </div>

        ${vorlage.format === 'eigen'
          ? html`
              <div class="zeilenwerte">
                ${zahlenfeld('breite', vorlage.breite, {
                  beschriftung: 'Breite', min: GRENZE_VORLAGE.KANTE_MIN, max: GRENZE_VORLAGE.KANTE_MAX,
                })}
                ${zahlenfeld('hoehe', vorlage.hoehe, {
                  beschriftung: 'Höhe', min: GRENZE_VORLAGE.KANTE_MIN, max: GRENZE_VORLAGE.KANTE_MAX,
                })}
              </div>
              ${fehlerZu(fehler, 'breite')}${fehlerZu(fehler, 'hoehe')}
            `
          : html`
              <input type="hidden" name="breite" value="${vorlage.breite}">
              <input type="hidden" name="hoehe" value="${vorlage.hoehe}">
              <p class="hinweis">${masse.breite} × ${masse.hoehe} Pixel.</p>
            `}

        <h2>Hintergrund</h2>
        <div class="zeilenwerte">
          <label class="zahlenfeld">
            <span>Grundfarbe</span>
            <input type="color" name="grundfarbe" value="${vorlage.grundfarbe}">
          </label>
          ${zahlenfeld('abdunklung', vorlage.abdunklung, {
            beschriftung: 'Abdunklung in %', min: 0, max: 100,
          })}
          <label class="zahlenfeld">
            <span>Bild einpassen</span>
            ${auswahl('hintergrundAnpassung', vorlage.hintergrundAnpassung, ANPASSUNGEN, ANPASSUNG_NAMEN)}
          </label>
        </div>
        ${fehlerZu(fehler, 'grundfarbe')}${fehlerZu(fehler, 'abdunklung')}

        <input type="hidden" name="hintergrundBild" value="${vorlage.hintergrundBild ?? ''}">
        <div class="feld">
          <label for="hintergrund">Hintergrundbild ${vorlage.hintergrundBild ? '' : '(keines)'}</label>
          <input type="file" id="hintergrund" name="hintergrund" accept="image/png,image/jpeg,image/webp">
          ${vorlage.hintergrundBild
            ? html`<button type="submit" name="hintergrundEntfernen" value="ja" class="knopf-leise">
                Hintergrundbild entfernen
              </button>`
            : ''}
          ${fehlerZu(fehler, 'hintergrund')}
        </div>

        <h2>Profilbild</h2>
        ${haken('avatarAn', vorlage.avatarAn, 'Profilbild einsetzen')}
        <div class="zeilenwerte">
          <label class="zahlenfeld">
            <span>Form</span>
            ${auswahl('avatarForm', vorlage.avatarForm, FORMEN, FORM_NAMEN)}
          </label>
          ${zahlenfeld('avatarX', vorlage.avatarX, { beschriftung: 'X', min: -4096, max: 4096 })}
          ${zahlenfeld('avatarY', vorlage.avatarY, { beschriftung: 'Y', min: -4096, max: 4096 })}
          ${zahlenfeld('avatarGroesse', vorlage.avatarGroesse, {
            beschriftung: 'Grösse', min: 1, max: GRENZE_VORLAGE.KANTE_MAX,
          })}
          ${zahlenfeld('avatarRand', vorlage.avatarRand, { beschriftung: 'Rand', min: 0, max: 64 })}
          <label class="zahlenfeld">
            <span>Randfarbe</span>
            <input type="color" name="avatarRandfarbe" value="${vorlage.avatarRandfarbe}">
          </label>
        </div>
        ${fehlerZu(fehler, 'avatarGroesse')}${fehlerZu(fehler, 'avatarRandfarbe')}

        ${zeilenEditor(vorlage, fehler)}

        <section class="vorschaubereich" aria-label="Vorschau">
          <div class="vorschaukopf">
            <h2>Vorschau</h2>
            <button type="submit" name="vorschauErneuern" value="ja" class="knopf-leise" data-nur-ohne-js>
              Vorschau aktualisieren
            </button>
          </div>
          ${mitgliedswahl({ entwurf, treffer, gewaehlt, avatarFehlt })}

          <div class="bildvorschau">
            <div class="ziehflaeche" data-ziehflaeche>
              <img id="vorlagenvorschau" src="${vorschau}" alt="Vorschau der Bildvorlage"
                   width="${masse.breite}" height="${masse.hoehe}">
            </div>
          </div>
          <p class="hinweis" data-nur-mit-js>
            Profilbild und Textzeilen lassen sich in der Vorschau verschieben. Mit den
            Pfeiltasten geht es Pixel für Pixel, mit Umschalt in Zehnerschritten.
          </p>
        </section>

        <div class="editorknoepfe">
          <button type="submit" name="speichern" value="ja" class="knopf-haupt">Speichern</button>
          <a href="/vorlagen" class="knopf-abbrechen">Abbrechen</a>
        </div>
      </form>
    `,
    skripte: ['/editor.js', '/vorlagen.js', '/ziehen.js'],
  });
}

function listeSeite({ req, bot, eintraege }) {
  return seite({
    titel: 'Bildvorlagen',
    pfad: '/vorlagen',
    stufe: req.stufe,
    sitzung: req.sitzung,
    botStatus: bot.status(),
    inhalt: html`
      <h1>Bildvorlagen</h1>
      <p class="unterzeile">
        Ein Bild, das zu jedem Empfänger passt: Der Name und das Profilbild werden beim Versand
        eingesetzt.
      </p>

      <p><a href="/vorlagen/neu" class="knopf-haupt">Neue Vorlage</a></p>

      ${eintraege.length === 0
        ? html`<p class="leer">Noch keine Bildvorlage angelegt.</p>`
        : html`
            <ul class="vorlagenliste">
              ${eintraege.map(
                (eintrag) => html`
                  <li>
                    <div class="vorlagentext">
                      <a href="/vorlagen/${eintrag.id}" class="vorlagenname">${eintrag.name}</a>
                      <span class="vorlagenmasse">
                        ${eintrag.vorlage.zeilen?.length ?? 0} Textzeilen · zuletzt geändert
                        ${alsZeitpunkt(eintrag.geaendertAm)}
                      </span>
                      ${eintrag.beschaedigt
                        ? html`<span class="hinweis-warn">
                            Die Einstellungen dieser Vorlage sind nicht lesbar. Beim Öffnen steht die
                            Grundeinstellung da — Speichern überschreibt sie.
                          </span>`
                        : ''}
                    </div>
                    <a href="/vorlagen/${eintrag.id}/loeschen" class="knopf-leise">Löschen</a>
                  </li>
                `,
              )}
            </ul>
          `}
    `,
  });
}

function loeschenSeite({ req, bot, eintrag }) {
  return seite({
    titel: 'Vorlage löschen?',
    pfad: '/vorlagen',
    stufe: req.stufe,
    sitzung: req.sitzung,
    botStatus: bot.status(),
    inhalt: html`
      <h1>Vorlage löschen?</h1>
      <div class="rueckfrage">
        <p class="rueckfrage-kern">
          Die Bildvorlage <strong>${eintrag.name}</strong> wird gelöscht.
        </p>
        <p class="hinweis">
          Nachrichten, die diese Vorlage benutzen, finden sie danach nicht mehr. Das lässt sich
          nicht rückgängig machen.
        </p>
      </div>

      <form method="post" action="/vorlagen/${eintrag.id}/loeschen" class="rueckfrage-knoepfe">
        ${csrfFeld(req)}
        <button type="submit" name="bestaetigt" value="ja" class="knopf-haupt">Ja, löschen</button>
        <a href="/vorlagen/${eintrag.id}" class="knopf-abbrechen">Abbrechen</a>
      </form>
    `,
  });
}

function nichtGefunden(req, bot, res) {
  return res.status(404).type('html').send(
    String(
      seite({
        titel: 'Nicht gefunden',
        pfad: '/vorlagen',
        stufe: req.stufe,
        sitzung: req.sitzung,
        botStatus: bot.status(),
        inhalt: html`
          <h1>Diese Bildvorlage gibt es nicht</h1>
          <p>Vielleicht gehört sie zu einem anderen Server, oder sie wurde gelöscht.</p>
          <p><a href="/vorlagen">Zurück zu den Bildvorlagen</a></p>
        `,
      }),
    ),
  );
}

export function registriereVorlagen(
  app, { bot, konfig, bildvorlagen, bilderVerzeichnis, gildenAnsicht, avatarQuelle },
) {
  const zeige = async (req, res, entwurf, { fehler = [], hinweis = null } = {}) => {
    const { daten, mitglied, avatarFehlt } = await vorschauDaten({
      mitgliedId: entwurf.mitgliedId, gildenAnsicht, konfig, avatarQuelle,
    });
    const png = await vorschauBild(entwurf.vorlage, bilderVerzeichnis, daten);

    // Ohne Suchbegriff wird nicht die ganze Mitgliederliste ausgeschüttet.
    const treffer =
      entwurf.mitgliedId || entwurf.suche.trim() === ''
        ? []
        : gildenAnsicht.sucheMitglieder(entwurf.suche, konfig.guildId).slice(0, 20);

    return res.type('html').send(
      String(editorSeite({
        req, bot, entwurf, vorschau: alsDatenAdresse(png),
        treffer, gewaehlt: mitglied, avatarFehlt, fehler, hinweis,
      })),
    );
  };

  const leererEntwurf = (vorlage, { id = null, name = '' } = {}) => ({
    id, name, mitgliedId: null, suche: '', vorlage,
  });

  app.get('/vorlagen', verlangt(STUFE.MODERATOR), (req, res) => {
    const eintraege = bildvorlagen.alle(konfig.guildId);
    res.type('html').send(String(listeSeite({ req, bot, eintraege })));
  });

  // Vor `/vorlagen/:id`, sonst wäre „neu“ eine Kennung.
  app.get('/vorlagen/neu', verlangt(STUFE.MODERATOR), async (req, res, next) => {
    try {
      await zeige(req, res, leererEntwurf(standardVorlage()));
    } catch (fehler) {
      next(fehler);
    }
  });

  app.get('/vorlagen/:id/loeschen', verlangt(STUFE.MODERATOR), (req, res) => {
    const eintrag = bildvorlagen.lies(konfig.guildId, Number(req.params.id));
    if (!eintrag) return nichtGefunden(req, bot, res);
    return res.type('html').send(String(loeschenSeite({ req, bot, eintrag })));
  });

  app.post('/vorlagen/:id/loeschen', verlangt(STUFE.MODERATOR), (req, res) => {
    const eintrag = bildvorlagen.lies(konfig.guildId, Number(req.params.id));
    if (!eintrag) return nichtGefunden(req, bot, res);

    // Löschen nur mit ausdrücklicher Bestätigung — ein untergeschobener Aufruf
    // ohne die Rückfrage erreicht damit nichts.
    if (req.body?.bestaetigt !== 'ja') {
      return res.status(422).type('html').send(String(loeschenSeite({ req, bot, eintrag })));
    }

    bildvorlagen.loesche(konfig.guildId, eintrag.id);
    return res.redirect(303, '/vorlagen');
  });

  app.get('/vorlagen/:id', verlangt(STUFE.MODERATOR), async (req, res, next) => {
    const eintrag = bildvorlagen.lies(konfig.guildId, Number(req.params.id));
    if (!eintrag) return nichtGefunden(req, bot, res);

    try {
      return await zeige(
        req, res,
        leererEntwurf(eintrag.vorlage, { id: String(eintrag.id), name: eintrag.name }),
        eintrag.beschaedigt
          ? { hinweis: 'Die gespeicherten Einstellungen waren nicht lesbar — hier steht die Grundeinstellung.' }
          : {},
      );
    } catch (fehler) {
      return next(fehler);
    }
  });

  // Dasselbe Bild wie auf der Seite, nur als eigene Antwort — für vorlagen.js.
  app.post('/vorlagen/vorschau.png', verlangt(STUFE.MODERATOR), vorschauGrenze(), async (req, res, next) => {
    try {
      const koerper = req.body ?? {};
      const { daten } = await vorschauDaten({
        mitgliedId: String(koerper.vorschauMitgliedId ?? '') || null,
        gildenAnsicht, konfig, avatarQuelle,
      });
      const png = await vorschauBild(vorlageAus(koerper), bilderVerzeichnis, daten);
      res.type('png').set('Cache-Control', 'no-store').send(png);
    } catch (fehler) {
      next(fehler);
    }
  });

  app.post('/vorlagen', verlangt(STUFE.MODERATOR), async (req, res, next) => {
    const koerper = req.body ?? {};
    const entwurf = entwurfAus(koerper);
    const fehler = [];
    let hinweis = null;

    try {
      // Eine mitgeschickte Datei wird immer angenommen, egal welcher Knopf
      // gedrückt wurde: Wer eine Datei ausgewählt hat, will sie hochladen.
      if (req.dateiZuGross) {
        fehler.push({
          feld: 'hintergrund',
          meldung:
            `Das Bild ist grösser als ${alsGroesse(konfig.uploadMaxBytes)} und wurde nicht ` +
            'angenommen. Die Grenze steht als UPLOAD_MAX_BYTES in der .env.',
        });
      } else if (req.datei && req.datei.length > 0) {
        try {
          const abgelegt = await pruefeUpload(req.datei, req.dateiName, {
            uploadMaxBytes: konfig.uploadMaxBytes,
            uploadMaxKante: konfig.uploadMaxKante,
            verzeichnis: bilderVerzeichnis,
          });
          entwurf.vorlage.hintergrundBild = abgelegt.dateiname;
          hinweis = `Hintergrundbild übernommen — ${abgelegt.breite} × ${abgelegt.hoehe} Pixel.`;
        } catch (fehlgeschlagen) {
          if (!(fehlgeschlagen instanceof UploadFehler)) throw fehlgeschlagen;
          fehler.push({ feld: 'hintergrund', meldung: fehlgeschlagen.message });
        }
      }

      if (koerper.hintergrundEntfernen !== undefined) {
        entwurf.vorlage.hintergrundBild = null;
        hinweis = 'Hintergrundbild entfernt.';
      }

      if (koerper.vorschauMitglied !== undefined) {
        // Geprüft wird beim Anzeigen: Eine Kennung, die es nicht gibt, führt
        // zurück zu den Beispieldaten statt zu einem Fehler.
        entwurf.mitgliedId = String(koerper.vorschauMitglied);
        entwurf.suche = '';
        return await zeige(req, res, entwurf, { fehler, hinweis });
      }

      if (koerper.vorschauMitgliedLoesen !== undefined) {
        entwurf.mitgliedId = null;
        return await zeige(req, res, entwurf, { fehler, hinweis });
      }

      if (koerper.vorschauSuchen !== undefined) return await zeige(req, res, entwurf, { fehler, hinweis });

      if (koerper.zeileHinzufuegen !== undefined) {
        if (entwurf.vorlage.zeilen.length < GRENZE_VORLAGE.ZEILEN) {
          entwurf.vorlage.zeilen.push(neueZeile(entwurf.vorlage));
        }
        return await zeige(req, res, entwurf, { fehler, hinweis });
      }

      if (koerper.zeileEntfernen !== undefined) {
        const index = Number(koerper.zeileEntfernen);
        if (Number.isInteger(index) && index >= 0 && index < entwurf.vorlage.zeilen.length) {
          entwurf.vorlage.zeilen.splice(index, 1);
        }
        return await zeige(req, res, entwurf, { fehler, hinweis });
      }

      // Platzhalter angehängt. Ohne JavaScript ans Ende der gewählten Zeile —
      // mit JavaScript setzt editor.js ihn vorher an die Schreibmarke.
      if (koerper.platzhalterEinfuegen !== undefined) {
        const geklickt = zerlegeKnopfwert(koerper.platzhalterEinfuegen);
        const treffer = geklickt && ZEILENZIEL.exec(geklickt.ziel);
        const zeile = treffer && entwurf.vorlage.zeilen[Number(treffer[1])];
        if (zeile && ERLAUBTE_PLATZHALTER.has(geklickt.platzhalter)) {
          zeile.text += geklickt.platzhalter;
        }
        return await zeige(req, res, entwurf, { fehler, hinweis });
      }

      if (koerper.speichern === undefined || fehler.length > 0) {
        return await zeige(req, res, entwurf, { fehler, hinweis });
      }

      const geprueft = pruefeVorlage(entwurf.name, entwurf.vorlage);
      if (!geprueft.ok) {
        return await zeige(req, res, entwurf, { fehler: geprueft.fehler, hinweis });
      }

      // Gespeichert wird die geprüfte Fassung, nicht die eingetippte: Was in der
      // Datenbank liegt, soll der Renderer ohne weitere Prüfung zeichnen können.
      const gesichert = sichereVorlage(entwurf.vorlage);

      if (entwurf.id) {
        const geaendert = bildvorlagen.aendere(konfig.guildId, Number(entwurf.id), {
          name: geprueft.name, vorlage: gesichert,
        });
        if (!geaendert) return nichtGefunden(req, bot, res);
        return res.redirect(303, '/vorlagen');
      }

      bildvorlagen.lege(konfig.guildId, { name: geprueft.name, vorlage: gesichert });
      return res.redirect(303, '/vorlagen');
    } catch (unerwartet) {
      return next(unerwartet);
    }
  });
}
