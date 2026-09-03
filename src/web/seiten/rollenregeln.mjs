import { html } from '../html/html.mjs';
import { seite } from '../html/layout.mjs';
import { verlangt } from '../mw/verlangt.mjs';
import { STUFE } from '../../auth/rechte.mjs';
import { csrfFeld } from '../../auth/csrf.mjs';
import { fehlerZu } from '../html/baukasten.mjs';
import { aktivAus } from './zwischenschritt.mjs';
import { pruefeEntzug } from '../../automatik/rollenregel.mjs';
import { alsZeitpunkt } from '../html/zeit.mjs';

/**
 * Rollenregeln: „Wer X erhält, verliert Y.“
 *
 * Hier sind die Pillen echte Formularelemente — Radios für den Auslöser,
 * Kontrollkästchen für den Entzug. Anders als bei den Rollen-Nachrichten ist
 * das keine Navigation, sondern die Regel selbst: Was angekreuzt ist, *ist*
 * die Einstellung. Damit funktionieren Tastatur und Vorlesesoftware ohne
 * eigenes Zutun, und ohne JavaScript ändert sich nichts.
 *
 * Gesperrte Rollen werden gezeigt und nicht versteckt. Eine Rolle, die fehlt,
 * lässt einen suchen; eine, die dasteht und sagt warum, beantwortet die Frage.
 */

/** Kurz an der Pille, ausführlich im Titel. */
const KURZ = new Map([
  ['Steht über der Rolle des Bots — Discord lässt ihn daran nicht rühren.', 'zu hoch'],
  ['Wird von einer Integration verwaltet und kann nicht vergeben werden.', 'verwaltet'],
  ['Dem Bot fehlt das Recht, Rollen zu verwalten.', 'kein Recht'],
  ['Das ist die Auslöserrolle selbst.', 'Auslöser'],
]);

function ausloeserpillen(rollen, gewaehlt) {
  return html`
    <fieldset class="pillenfeld">
      <legend>Auslöser — welche Rolle die Regel startet</legend>
      <div class="pillen">
        ${rollen.map(
          (rolle) => html`
            <label class="pille">
              <input type="radio" name="ausloeser" value="${rolle.id}"${
                rolle.id === gewaehlt ? html` checked` : ''
              }>
              <span class="pillentext">${rolle.name}</span>
            </label>
          `,
        )}
      </div>
    </fieldset>
  `;
}

function entzugspillen(rollen, ausloeserId, gewaehlt) {
  const gesetzt = new Set(gewaehlt);

  return html`
    <fieldset class="pillenfeld">
      <legend>Entzug — was dabei weggenommen wird</legend>
      <div class="pillen">
        ${rollen.map((rolle) => {
          const urteil = pruefeEntzug(rolle, ausloeserId);
          const kurz = urteil.erlaubt ? null : (KURZ.get(urteil.grund) ?? 'gesperrt');

          return html`
            <label class="pille${urteil.erlaubt ? '' : ' pille-gesperrt'}"
                   title="${urteil.erlaubt ? rolle.name : `${rolle.name} — ${urteil.grund}`}">
              <input type="checkbox" name="entzug" value="${rolle.id}"${
                gesetzt.has(rolle.id) ? html` checked` : ''
              }${urteil.erlaubt ? '' : html` disabled`}>
              <span class="pillentext">${rolle.name}</span>
              ${kurz ? html`<span class="pillengrund">${kurz}</span>` : ''}
            </label>
          `;
        })}
      </div>
    </fieldset>
  `;
}

/** Die Regel in einem Satz — das ist die Probe, ob sie meint, was gemeint war. */
export function regelsatz(ausloeserName, entzugsNamen) {
  if (!ausloeserName) return 'Wähle einen Auslöser.';
  if (entzugsNamen.length === 0) {
    return `Wer „${ausloeserName}“ erhält, verliert nichts — die Regel täte nichts.`;
  }

  const liste =
    entzugsNamen.length === 1
      ? `„${entzugsNamen[0]}“`
      : `${entzugsNamen.slice(0, -1).map((n) => `„${n}“`).join(', ')} und „${entzugsNamen.at(-1)}“`;

  return `Wer „${ausloeserName}“ erhält, verliert ${liste}.`;
}

function regelliste(regeln, namen) {
  if (regeln.length === 0) {
    return html`<p class="leer">Noch keine Regel. Unten lässt sich eine anlegen.</p>`;
  }

  return html`
    <ul class="regelliste">
      ${regeln.map((regel) => {
        const ausloeserName = namen.get(regel.ausloeser);
        const entzugsNamen = regel.entzug.map((id) => namen.get(id) ?? id);

        return html`
          <li class="regelkarte">
            <p class="regelsatz">
              ${regelsatz(ausloeserName ?? regel.ausloeser, entzugsNamen)}
              <span class="ablageart">${regel.aktiv ? 'aktiv' : 'ruht'}</span>
            </p>
            ${!ausloeserName
              ? html`<p class="hinweis-warn">
                  Die Auslöserrolle gibt es nicht mehr. Die Regel läuft ins Leere.
                </p>`
              : ''}
            ${regel.notiz.trim() !== '' ? html`<p class="ablagenotiz">${regel.notiz}</p>` : ''}
            <p class="ablagefuss">
              <span class="ablagezeit">Zuletzt geändert ${alsZeitpunkt(regel.geaendertAm)}</span>
            </p>
            <div class="ablageknoepfe">
              <a href="/rollenregeln?ausloeser=${regel.ausloeser}" class="knopf-leise">Bearbeiten</a>
            </div>
          </li>
        `;
      })}
    </ul>
  `;
}

function regelSeite({ req, bot, rollen, regeln, namen, entwurf, fehler = [], hinweis = null }) {
  const ausloeserName = namen.get(entwurf.ausloeser);
  const entzugsNamen = entwurf.entzug.map((id) => namen.get(id) ?? id);

  return seite({
    titel: 'Rollenregeln',
    pfad: '/rollenregeln',
    stufe: req.stufe,
    sitzung: req.sitzung,
    botStatus: bot.status(),
    inhalt: html`
      <h1>Rollenregeln</h1>
      <p class="unterzeile">
        Wer eine Rolle bekommt, verliert dabei andere. Nützlich für Stufen, die
        einander ablösen.
      </p>

      ${hinweis ? html`<p class="hinweis-gut">${hinweis}</p>` : ''}

      <h2>Bestehende Regeln</h2>
      ${regelliste(regeln, namen)}

      ${rollen.length === 0
        ? html`<p class="leer">
            Der Bot sieht auf diesem Server keine Rollen. Ist er verbunden und eingeladen?
          </p>`
        : html`
            <h2>${entwurf.ausloeser ? 'Regel bearbeiten' : 'Neue Regel'}</h2>

            <form method="post" action="/rollenregeln" class="editor">
              ${csrfFeld(req)}

              ${ausloeserpillen(rollen, entwurf.ausloeser)}
              ${fehlerZu(fehler, 'ausloeser')}

              ${entzugspillen(rollen, entwurf.ausloeser, entwurf.entzug)}
              ${fehlerZu(fehler, 'entzug')}

              <p class="regelsatz regelsatz-vorschau">
                ${regelsatz(ausloeserName, entzugsNamen)}
              </p>

              <div class="schalterzeile">
                <label class="haken">
                  <input type="hidden" name="aktiv" value="nein">
                  <input type="checkbox" name="aktiv" value="ja"${entwurf.aktiv ? html` checked` : ''}>
                  Aktiv — die Regel anwenden
                </label>
                <span class="schalterlage">
                  ${entwurf.aktiv
                    ? html`<span class="lage-an">Läuft.</span> Sie greift beim nächsten Rollenerhalt.`
                    : html`<span class="lage-aus">Ausgeschaltet.</span> Sie bleibt gespeichert.`}
                </span>
              </div>
              ${fehlerZu(fehler, 'aktiv')}

              <div class="feld">
                <label for="notiz">Notiz</label>
                <textarea id="notiz" name="notiz" rows="2"
                          placeholder="Wozu ist die Regel da?">${entwurf.notiz}</textarea>
              </div>

              <div class="editor-fuss">
                <button type="submit" name="uebernehmen" value="ja" class="knopf-leise">
                  Auswahl übernehmen
                </button>
                <button type="submit" name="sichern" value="ja" class="knopf-haupt">Speichern</button>
                ${entwurf.ausloeser && regeln.some((r) => r.ausloeser === entwurf.ausloeser)
                  ? html`<button type="submit" name="loeschen" value="ja" class="knopf-leise">
                      Regel löschen
                    </button>`
                  : ''}
                <span class="hinweis">
                  „Auswahl übernehmen“ zeigt den Satz neu, ohne zu speichern — dabei werden
                  auch die Sperren am neuen Auslöser sichtbar.
                </span>
              </div>
            </form>
          `}
    `,
  });
}

/** Der Entwurf aus dem Formularkörper. */
function entwurfAus(koerper = {}) {
  const liste = (wert) => (wert === undefined ? [] : Array.isArray(wert) ? wert : [wert]);
  return {
    ausloeser: String(koerper.ausloeser ?? '') || null,
    entzug: liste(koerper.entzug).map(String),
    aktiv: aktivAus(koerper),
    notiz: String(koerper.notiz ?? ''),
  };
}

/**
 * Prüft die Regel — und zwar serverseitig, nicht nur über `disabled` im
 * Formular. Ein untergeschobener Aufruf käme sonst an der Sperre vorbei, und
 * der Bot versuchte etwas, das Discord ihm ohnehin verweigert.
 */
export function pruefeRegel(entwurf, rollen) {
  const fehler = [];
  const nachId = new Map(rollen.map((r) => [r.id, r]));

  if (!entwurf.ausloeser || !nachId.has(entwurf.ausloeser)) {
    fehler.push({ feld: 'ausloeser', meldung: 'Wähle eine Auslöserrolle, die es auf dem Server gibt.' });
  }

  for (const id of entwurf.entzug) {
    const urteil = pruefeEntzug(nachId.get(id), entwurf.ausloeser);
    if (!urteil.erlaubt) {
      const name = nachId.get(id)?.name ?? id;
      fehler.push({ feld: 'entzug', meldung: `„${name}“ lässt sich nicht entziehen: ${urteil.grund}` });
    }
  }

  if (entwurf.aktiv && entwurf.entzug.length === 0) {
    fehler.push({
      feld: 'aktiv',
      meldung: 'Eine aktive Regel, die nichts entzieht, täte nichts. Wähle etwas aus, oder schalte sie ab.',
    });
  }

  return { ok: fehler.length === 0, fehler };
}

export function registriereRollenregeln(app, { bot, konfig, rollenregeln, gildenAnsicht }) {
  const namenKarte = () =>
    new Map(gildenAnsicht.rollen(konfig.guildId).map((r) => [r.id, r.name]));

  const zeige = (req, res, entwurf, { fehler = [], hinweis = null, lage = 200 } = {}) =>
    res.status(lage).type('html').send(
      String(
        regelSeite({
          req, bot,
          rollen: gildenAnsicht.rollen(konfig.guildId),
          regeln: rollenregeln.alle(konfig.guildId),
          namen: namenKarte(),
          entwurf, fehler, hinweis,
        }),
      ),
    );

  app.get('/rollenregeln', verlangt(STUFE.MODERATOR), (req, res) => {
    const gewaehlt = req.query.ausloeser ? String(req.query.ausloeser) : null;
    const regel = gewaehlt ? rollenregeln.fuerAusloeser(konfig.guildId, gewaehlt) : undefined;

    return zeige(req, res, {
      ausloeser: regel?.ausloeser ?? gewaehlt,
      entzug: regel?.entzug ?? [],
      aktiv: regel?.aktiv ?? false,
      notiz: regel?.notiz ?? '',
    });
  });

  app.post('/rollenregeln', verlangt(STUFE.MODERATOR), (req, res) => {
    const koerper = req.body ?? {};
    const entwurf = entwurfAus(koerper);

    if (koerper.loeschen !== undefined) {
      if (entwurf.ausloeser) rollenregeln.loesche(konfig.guildId, entwurf.ausloeser);
      return zeige(req, res, { ausloeser: null, entzug: [], aktiv: false, notiz: '' }, {
        hinweis: 'Regel gelöscht.',
      });
    }

    // Nur neu zeigen: Der Satz und die Sperren richten sich nach dem gewählten
    // Auslöser, und der kann sich gerade geändert haben.
    if (koerper.uebernehmen !== undefined) return zeige(req, res, entwurf);

    const geprueft = pruefeRegel(entwurf, gildenAnsicht.rollen(konfig.guildId));
    if (!geprueft.ok) return zeige(req, res, entwurf, { fehler: geprueft.fehler, lage: 422 });

    rollenregeln.sichere(konfig.guildId, entwurf.ausloeser, {
      entzug: entwurf.entzug, aktiv: entwurf.aktiv, notiz: entwurf.notiz,
    });

    const namen = namenKarte();
    return zeige(req, res, entwurf, {
      hinweis: `Gespeichert. ${regelsatz(namen.get(entwurf.ausloeser), entwurf.entzug.map((id) => namen.get(id) ?? id))}`,
    });
  });
}
