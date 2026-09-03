import { html } from '../html/html.mjs';
import { seite } from '../html/layout.mjs';
import { verlangt } from '../mw/verlangt.mjs';
import { STUFE } from '../../auth/rechte.mjs';
import { csrfFeld } from '../../auth/csrf.mjs';
import { GRENZE, ART } from '../../nachricht/modell.mjs';
import { entwurfAus, alsEingabe } from '../../nachricht/entwurf.mjs';
import { embedEditor } from '../html/embed.mjs';
import { vorschau, MODUS } from '../../nachricht/vorschau.mjs';
import { empfaengerwahl } from '../html/empfaengerwahl.mjs';
import { kanalwahl } from '../html/kanalwahl.mjs';
import { darfBot, AKTION } from '../../discord/rechte.mjs';
import { loeseEmpfaengerAuf, parseAuswahl, alsAuswahlWert, pruefeGrenze } from '../../versand/empfaenger.mjs';
import { vorschauGrenze } from '../mw/sicherheit.mjs';
import { PLATZHALTER } from '../../nachricht/platzhalter.mjs';
import { fuegeEin, zerlegeKnopfwert } from '../../nachricht/platzhalterziel.mjs';
import { platzhalterreihe } from '../html/platzhalterreihe.mjs';
import { schublade, schubladenSchalter } from '../html/schublade.mjs';
import { pruefeNachricht } from '../../nachricht/pruefen.mjs';
import { bestaetigungsSeite } from './versand.mjs';
import { speichereEntwurf, zielnamenFuer } from './ablage.mjs';

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

/** Treffer der Empfaengersuche: Mitglieder und Rollen gemeinsam. */
function sucheTreffer(gildenAnsicht, guildId, begriff, auswahl) {
  if (begriff.trim() === '') return [];

  const gewaehlt = new Set(auswahl.map(alsAuswahlWert));
  const gesucht = begriff.trim().toLowerCase();

  const mitglieder = gildenAnsicht.sucheMitglieder(begriff, guildId).map((m) => ({
    art: 'mitglied', id: m.id, name: m.name,
  }));

  const alleMitglieder = gildenAnsicht.sucheMitglieder('', guildId);
  const rollen = gildenAnsicht
    .rollen(guildId)
    .filter((r) => r.name.toLowerCase().includes(gesucht))
    .map((r) => ({
      art: 'rolle', id: r.id, name: r.name,
      anzahl: alleMitglieder.filter((m) => m.rollenIds.includes(r.id)).length,
    }));

  return [...rollen, ...mitglieder].filter((t) => !gewaehlt.has(alsAuswahlWert(t))).slice(0, 20);
}

/**
 * Welche Bildvorlage die Nachricht mitschickt.
 *
 * Beim Versand entsteht daraus je Empfänger ein eigenes Bild — mit seinem
 * Namen und seinem Profilbild. Gibt es noch keine Vorlage, steht hier der Weg
 * dorthin statt eines leeren Auswahlfeldes.
 */
function bildwahl(entwurf, vorlagen) {
  if (vorlagen.length === 0) {
    return html`
      <input type="hidden" name="bildvorlageId" value="">
      <p class="hinweis">
        Noch keine Bildvorlage vorhanden. Unter
        <a href="/vorlagen">Bildvorlagen</a> lässt sich eine anlegen; sie wird dann
        je Empfänger mit dessen Namen und Profilbild gefüllt.
      </p>
    `;
  }

  const gewaehlt = String(entwurf.bildvorlageId ?? '');

  return html`
    <div class="feld feld-mittel">
      <label for="bildvorlageId">Bildvorlage</label>
      <select id="bildvorlageId" name="bildvorlageId">
        <option value=""${gewaehlt === '' ? html` selected` : ''}>Keine</option>
        ${vorlagen.map(
          (v) => html`
            <option value="${v.id}"${gewaehlt === String(v.id) ? html` selected` : ''}>${v.name}</option>
          `,
        )}
      </select>
      <p class="hinweis">Jeder Empfänger bekommt sein eigenes Bild.</p>
    </div>
  `;
}

function editorSeite({ req, bot, konfig, gildenAnsicht, entwurf, vorlagen = [], gespeicherte = [], fehler = [] }) {
  const laenge = entwurf.text.length;
  const zuFeld = (feld) => fehlerZu(fehler, feld);

  const aufgeloest = loeseEmpfaengerAuf(gildenAnsicht, entwurf.empfaenger, konfig.guildId);
  const namen = new Map([
    ...gildenAnsicht.sucheMitglieder('', konfig.guildId).map((m) => [`mitglied:${m.id}`, m.name]),
    ...gildenAnsicht.rollen(konfig.guildId).map((r) => [`rolle:${r.id}`, r.name]),
  ]);
  const chipTitel = (eintrag) => namen.get(alsAuswahlWert(eintrag)) ?? 'Nicht mehr vorhanden';

  // Wie viele Empfaenger eine Rolle wirklich ergibt, steht am Chip: Der Name
  // allein sagt nicht, ob dahinter drei Leute stehen oder dreihundert.
  const alleMitglieder = gildenAnsicht.sucheMitglieder('', konfig.guildId);
  const chipZahl = (eintrag) =>
    alleMitglieder.filter((m) => m.rollenIds.includes(eintrag.id)).length;

  return seite({
    titel: 'Nachricht',
    pfad: '/nachricht',
    stufe: req.stufe,
    sitzung: req.sitzung,
    botStatus: bot.status(),
    inhalt: html`
      <div class="seitenkopf">
        <div>
          <h1>Nachricht</h1>
          <p class="unterzeile">
            Direktnachricht und Kanal auf einer Seite. Der Wechsel behält den getippten Text.
          </p>
        </div>
        ${schubladenSchalter()}
      </div>

      ${schublade(gespeicherte)}

      <form method="post" action="/nachricht" class="editor">
        ${csrfFeld(req)}
        <input type="hidden" name="art" value="${entwurf.art}">
        ${entwurf.gespeichertId
          ? html`<input type="hidden" name="gespeichertId" value="${entwurf.gespeichertId}">`
          : ''}

        ${reiter(entwurf.art)}

        <div class="feld">
          <label for="text">
            Text
            <span class="zaehler" data-zaehler-fuer="text" data-grenze="${GRENZE.TEXT}">
              ${laenge} / ${GRENZE.TEXT}
            </span>
          </label>
          <textarea id="text" name="text" rows="8" maxlength="${GRENZE.TEXT * 2}"
                    data-platzhalter-ziel="text">${entwurf.text}</textarea>
          ${fehlerZu(fehler, 'text')}
        </div>

        ${platzhalterreihe('text', { beschriftung: 'Variablen einfügen' })}

        ${entwurf.art === ART.DM
          ? empfaengerwahl({
              auswahl: entwurf.empfaenger,
              aufgeloest,
              treffer: sucheTreffer(gildenAnsicht, konfig.guildId, entwurf.empfaengerSuche, entwurf.empfaenger),
              suchbegriff: entwurf.empfaengerSuche,
              konfig,
              botVerbunden: bot.status().verbunden,
              chipTitel,
              chipZahl,
              fehler: zuFeld('empfaenger'),
            })
          : kanalwahl({
              kanaele: gildenAnsicht
                .kanaele(konfig.guildId)
                .filter(
                  (k) =>
                    entwurf.kanalSuche.trim() === '' ||
                    k.name.toLowerCase().includes(entwurf.kanalSuche.trim().toLowerCase()),
                ),
              gewaehlt: entwurf.kanalId,
              suchbegriff: entwurf.kanalSuche,
              botVerbunden: bot.status().verbunden,
              fehler: zuFeld('kanalId'),
            })}

        ${entwurf.embedAn
          ? embedEditor({ embed: entwurf.embed, fehlerZu: zuFeld })
          : html`
              <div class="embed-anbieten">
                <button type="submit" name="embedUmschalten" value="ja" class="knopf-leise">
                  Embed-Karte anhängen
                </button>
              </div>
            `}

        <div class="feld feld-mittel">
          <label for="name">Name zum Speichern</label>
          <input type="text" id="name" name="name" value="${entwurf.name}" maxlength="80"
                 placeholder="z. B. Willkommensgruss">
          ${fehlerZu(fehler, 'name')}
        </div>

        <div class="editor-fuss">
          <button type="submit" name="senden" value="ja" class="knopf-haupt">Senden …</button>
          <button type="submit" name="speichern" value="ja" class="knopf-leise">Speichern</button>
          <button type="submit" name="pruefen" value="ja" class="knopf-leise">Nur prüfen</button>
          <span class="hinweis">
            ${entwurf.gespeichertId
              ? html`Vor dem Versand kommt eine Rückfrage. „Speichern" überschreibt die
                  gespeicherte Nachricht — für eine zweite Fassung gibt es in der
                  <a href="/nachrichten">Liste</a> den Knopf „Kopie".`
              : html`Vor dem Versand kommt eine Rückfrage. Mit Namen wird beim Senden
                  zusätzlich gespeichert.`}
          </span>
        </div>

        <input type="hidden" name="vorschauModus" value="${entwurf.vorschauModus}">
        ${bildwahl(entwurf, vorlagen)}

        <section class="vorschaubereich" aria-label="Vorschau">
          <div class="vorschaukopf">
            <h2>Vorschau</h2>
            <div class="vorschauwahl" role="group" aria-label="Ansicht der Vorschau">
              <button type="submit" name="vorschauWechseln" value="${MODUS.BEISPIEL}"
                class="vorschau-knopf${entwurf.vorschauModus === MODUS.BEISPIEL ? ' vorschau-aktiv' : ''}"
                aria-pressed="${entwurf.vorschauModus === MODUS.BEISPIEL ? 'true' : 'false'}"
              >Mit Beispieldaten</button>
              <button type="submit" name="vorschauWechseln" value="${MODUS.ROH}"
                class="vorschau-knopf${entwurf.vorschauModus === MODUS.ROH ? ' vorschau-aktiv' : ''}"
                aria-pressed="${entwurf.vorschauModus === MODUS.ROH ? 'true' : 'false'}"
              >Rohtext</button>
              <button type="submit" name="vorschauErneuern" value="ja" class="knopf-leise"
                      data-nur-ohne-js>Vorschau aktualisieren</button>
            </div>
          </div>
          <div class="vorschau-flaeche" id="vorschau">
            ${vorschau(entwurf, { modus: entwurf.vorschauModus })}
          </div>
        </section>
      </form>
    `,
    skripte: ['/editor.js', '/schublade.js'],
  });
}

/**
 * Prüft einen Entwurf vollständig: Inhalt, Empfängergrenze und Schreibrecht im
 * Kanal. Der Versandstart benutzt dieselbe Funktion — sonst könnte ein
 * untergeschobener Aufruf die Prüfung der Editorseite umgehen.
 */
export function erstellePruefung({ konfig, gildenAnsicht }) {
  return (entwurf) => {
    const geprueft = pruefeNachricht(alsEingabe(entwurf));
    const fehler = [...(geprueft.fehler ?? [])];

    if (entwurf.art === ART.DM) {
      const aufgeloest = loeseEmpfaengerAuf(gildenAnsicht, entwurf.empfaenger, konfig.guildId);
      const grenze = pruefeGrenze(aufgeloest, konfig.dmMaxEmpfaenger);
      if (!grenze.ok) fehler.push({ feld: 'empfaenger', meldung: grenze.meldung });
    } else if (!entwurf.kanalId) {
      fehler.push({ feld: 'kanalId', meldung: 'Wähle einen Kanal aus.' });
    } else {
      const urteil = darfBot(AKTION.IN_KANAL_SCHREIBEN, {
        ansicht: gildenAnsicht,
        kanalId: entwurf.kanalId,
      });
      if (!urteil.erlaubt) fehler.push({ feld: 'kanalId', meldung: urteil.grund });
    }

    return { ok: fehler.length === 0, fehler };
  };
}

export function registriereNachricht(app, { bot, konfig, gildenAnsicht, bildvorlagen, nachrichtenAblage }) {
  // Nur Name und Kennung — der Editor zeigt eine Liste, keine Vorlagen.
  const speichere = (guildId, entwurf) =>
    speichereEntwurf(
      nachrichtenAblage, guildId, entwurf, zielnamenFuer(gildenAnsicht, guildId, entwurf),
    );

  /**
   * Der Entwurf beim Aufruf der Seite: leer, oder aus der Ablage geladen.
   *
   * Geladen wird alles gemeinsam — Text, Embed, Bildvorlage und das gemerkte
   * Ziel. Ein Öffnen, das die Hälfte weglässt, wäre schlimmer als keines: Man
   * sähe es erst beim Absenden.
   *
   * @returns {object|undefined} undefined, wenn es die Kennung nicht gibt
   */
  function ausAblageOderNeu(req) {
    if (req.query.laden === undefined) return entwurfAus({ art: req.query.art });

    const kennung = Number(req.query.laden);
    const eintrag = Number.isInteger(kennung) && nachrichtenAblage
      ? nachrichtenAblage.lies(konfig.guildId, kennung)
      : undefined;
    if (!eintrag || eintrag.beschaedigt) return undefined;

    return entwurfAus({ ...eintrag.daten, name: eintrag.name, gespeichertId: String(eintrag.id) });
  }

  function nichtGefunden(req, res) {
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
            <p>Vielleicht wurde sie gelöscht, oder ihr Inhalt ist nicht lesbar.</p>
            <p><a href="/nachrichten">Zurück zur Liste</a></p>
          `,
        }),
      ),
    );
  }

  // Die Schublade steht in der Seite und wird nicht nachgeladen — deshalb hier
  // bei jedem Aufbau frisch gelesen.
  const gespeicherteListe = () =>
    nachrichtenAblage ? nachrichtenAblage.alle(konfig.guildId) : [];

  const vorlagenliste = () =>
    bildvorlagen ? bildvorlagen.alle(konfig.guildId).map((v) => ({ id: v.id, name: v.name })) : [];

  const pruefeEntwurf = erstellePruefung({ konfig, gildenAnsicht });
  // Alte Adressen bleiben gueltig.
  app.get('/dm', verlangt(STUFE.MODERATOR), (_req, res) => res.redirect(301, '/nachricht?art=dm'));
  app.get('/kanaele', verlangt(STUFE.MODERATOR), (_req, res) =>
    res.redirect(301, '/nachricht?art=kanal'),
  );

  app.get('/nachricht', verlangt(STUFE.MODERATOR), (req, res) => {
    const entwurf = ausAblageOderNeu(req);
    if (entwurf === undefined) return nichtGefunden(req, res);
    res.type('html').send(String(editorSeite({ req, bot, konfig, gildenAnsicht, entwurf, vorlagen: vorlagenliste(), gespeicherte: gespeicherteListe() })));
  });

  // Dieselbe Vorschau wie auf der Seite — nur das Bruchstueck, fuer editor.js.
  app.post('/nachricht/vorschau', verlangt(STUFE.MODERATOR), vorschauGrenze(), (req, res) => {
    const entwurf = entwurfAus(req.body ?? {});
    res.type('html').send(String(vorschau(entwurf, { modus: entwurf.vorschauModus })));
  });

  app.post('/nachricht', verlangt(STUFE.MODERATOR), (req, res) => {
    const koerper = req.body ?? {};
    const entwurf = entwurfAus(koerper);
    const zeigen = () =>
      res.type('html').send(String(editorSeite({ req, bot, konfig, gildenAnsicht, entwurf, vorlagen: vorlagenliste(), gespeicherte: gespeicherteListe() })));

    // Reiter gewechselt: dasselbe Formular, anderes Ziel, gleicher Inhalt.
    if (koerper.wechselZu === ART.DM || koerper.wechselZu === ART.KANAL) {
      entwurf.art = koerper.wechselZu;
      return zeigen();
    }

    if (koerper.hinzufuegen !== undefined) {
      entwurf.empfaenger = parseAuswahl([
        ...entwurf.empfaenger.map(alsAuswahlWert),
        String(koerper.hinzufuegen),
      ]);
      entwurf.empfaengerSuche = '';
      return zeigen();
    }

    if (koerper.entfernen !== undefined) {
      const weg = String(koerper.entfernen);
      entwurf.empfaenger = entwurf.empfaenger.filter((e) => alsAuswahlWert(e) !== weg);
      return zeigen();
    }

    if (koerper.suchen !== undefined) return zeigen();

    if (koerper.vorschauWechseln !== undefined) {
      entwurf.vorschauModus = koerper.vorschauWechseln === MODUS.ROH ? MODUS.ROH : MODUS.BEISPIEL;
      return zeigen();
    }

    if (koerper.vorschauErneuern !== undefined) return zeigen();

    // Speichern prüft nur den Inhalt, nicht das Ziel: Ein Entwurf darf ohne
    // Empfänger in die Ablage, gesendet wird er dadurch ja nicht.
    if (koerper.speichern !== undefined && nachrichtenAblage) {
      const geprueft = pruefeNachricht(alsEingabe(entwurf));
      const fehler = [...(geprueft.fehler ?? [])];
      if (entwurf.name.trim() === '') {
        fehler.push({ feld: 'name', meldung: 'Gib der Nachricht einen Namen, damit du sie wiederfindest.' });
      }

      if (fehler.length > 0) {
        return res.status(422).type('html').send(
          String(editorSeite({ req, bot, konfig, gildenAnsicht, entwurf, vorlagen: vorlagenliste(), gespeicherte: gespeicherteListe(), fehler })),
        );
      }

      speichere(konfig.guildId, entwurf);
      return res.redirect(303, `/nachrichten?art=${entwurf.art}`);
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

    // Platzhalter angehaengt. Ohne JavaScript ans Ende des gewaehlten Feldes —
    // mit JavaScript setzt editor.js ihn an die Schreibmarke, bevor es hierher
    // kommt.
    if (koerper.platzhalterEinfuegen !== undefined) {
      const geklickt = zerlegeKnopfwert(koerper.platzhalterEinfuegen);
      if (geklickt && ERLAUBTE_PLATZHALTER.has(geklickt.platzhalter)) {
        fuegeEin(entwurf, geklickt.ziel, geklickt.platzhalter);
      }
      return zeigen();
    }

    // Das Ziel wird serverseitig geprueft, nicht nur im Formular ausgeblendet:
    // Eine untergeschobene Kanal-ID darf nicht dazu fuehren, dass der Bot
    // irgendwohin schreibt.
    const geprueft = pruefeEntwurf(entwurf);

    if (!geprueft.ok) {
      return res
        .status(422)
        .type('html')
        .send(String(editorSeite({ req, bot, konfig, gildenAnsicht, entwurf, vorlagen: vorlagenliste(), gespeicherte: gespeicherteListe(), fehler: geprueft.fehler })));
    }

    // Senden gewuenscht: erst die Rueckfrage, nie sofort.
    if (koerper.senden !== undefined) {
      const aufgeloest = loeseEmpfaengerAuf(gildenAnsicht, entwurf.empfaenger, konfig.guildId);
      const kanal = gildenAnsicht.findeKanal(entwurf.kanalId, konfig.guildId);
      return res.type('html').send(
        String(bestaetigungsSeite({
          req, bot, konfig, entwurf, aufgeloest, ziel: kanal?.name ?? entwurf.kanalId,
        })),
      );
    }

    return zeigen();
  });
}
