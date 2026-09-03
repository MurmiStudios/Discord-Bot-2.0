import { html } from '../html/html.mjs';
import { seite } from '../html/layout.mjs';
import { verlangt } from '../mw/verlangt.mjs';
import { versandGrenze } from '../mw/sicherheit.mjs';
import { STUFE } from '../../auth/rechte.mjs';
import { csrfFeld } from '../../auth/csrf.mjs';
import { ART } from '../../nachricht/modell.mjs';
import { entwurfAus, entwurfAlsFelder, alsNachricht } from '../../nachricht/entwurf.mjs';
import { speichereEntwurf } from './ablage.mjs';
import { vorschau } from '../../nachricht/vorschau.mjs';
import { loeseEmpfaengerAuf } from '../../versand/empfaenger.mjs';
import { VORGANG, ZIEL } from '../../daten/versand.mjs';

/**
 * Die Rückfrage vor dem Versand.
 *
 * Sie trägt den ganzen Entwurf als versteckte Felder weiter. Dadurch muss sich
 * der Server zwischen Rückfrage und Start nichts merken — es gibt keinen
 * Zwischenspeicher, der veralten oder von jemand anderem überschrieben werden
 * könnte.
 */
export function bestaetigungsSeite({ req, bot, konfig, entwurf, aufgeloest, ziel }) {
  const anzahl = entwurf.art === ART.DM ? aufgeloest.anzahl : 1;
  const dauer = Math.round((anzahl * konfig.dmPauseMs) / 1000);

  return seite({
    titel: 'Wirklich senden?',
    pfad: '/nachricht',
    stufe: req.stufe,
    sitzung: req.sitzung,
    botStatus: bot.status(),
    inhalt: html`
      <h1>Wirklich senden?</h1>

      <div class="rueckfrage">
        <p class="rueckfrage-kern">
          ${entwurf.art === ART.DM
            ? html`Die Nachricht geht als Direktnachricht an <strong>${anzahl} Empfänger</strong>.`
            : html`Die Nachricht geht in den Kanal <strong>#${ziel}</strong>.`}
        </p>
        ${entwurf.art === ART.DM && anzahl > 1
          ? html`<p class="hinweis">
              Zwischen zwei Nachrichten liegen ${konfig.dmPauseMs} ms — der Versand dauert
              rund ${dauer} Sekunden. Er läuft im Hintergrund weiter, auch wenn du die Seite verlässt.
            </p>`
          : ''}
        ${entwurf.name.trim() !== ''
          ? html`<p class="hinweis">
              Wird ausserdem unter <strong>${entwurf.name.trim()}</strong> gespeichert und steht
              danach unter „Gespeicherte Nachrichten".
            </p>`
          : ''}
        ${entwurf.art === ART.DM && aufgeloest.leereRollen.length > 0
          ? html`<p class="hinweis-warn">
              Ohne Wirkung: ${aufgeloest.leereRollen.map((r) => r.name).join(', ')} —
              diese Rolle hat keine Mitglieder.
            </p>`
          : ''}
      </div>

      <h2>Was verschickt wird</h2>
      <div class="vorschau-flaeche">${vorschau(alsNachricht(entwurf), { modus: 'beispiel' })}</div>

      ${entwurf.art === ART.DM && aufgeloest.empfaenger.length > 0
        ? html`
            <h2>An wen</h2>
            <p class="empfaengerliste">
              ${aufgeloest.empfaenger.map((e) => html`<span class="chip">${e.name}</span>`)}
            </p>
          `
        : ''}

      <form method="post" action="/versand/starten" class="rueckfrage-knoepfe">
        ${csrfFeld(req)}
        ${entwurfAlsFelder(entwurf)}
        <button type="submit" name="bestaetigt" value="ja" class="knopf-haupt">
          Ja, jetzt senden
        </button>
        <a href="/nachricht?art=${entwurf.art}" class="knopf-abbrechen">Zurück zum Editor</a>
      </form>
    `,
  });
}

function fortschrittSeite({ req, bot, vorgang, ziele }) {
  const laeuft = vorgang.zustand === VORGANG.LAEUFT;
  const nichtErreicht = ziele.filter((z) => z.zustand === ZIEL.FEHLGESCHLAGEN);
  const anteil = vorgang.gesamt === 0 ? 100 : Math.round((vorgang.erledigt / vorgang.gesamt) * 100);

  return seite({
    titel: 'Versand',
    pfad: '/nachricht',
    stufe: req.stufe,
    sitzung: req.sitzung,
    botStatus: bot.status(),
    inhalt: html`
      <h1>Versand</h1>
      ${vorgang.betreff ? html`<p class="unterzeile">${vorgang.betreff}</p>` : ''}

      <div class="fortschritt" data-vorgang="${vorgang.id}" data-laeuft="${laeuft ? 'ja' : 'nein'}">
        <p class="fortschritt-zahl">
          <strong>${vorgang.erledigt} von ${vorgang.gesamt}</strong> erledigt
          ${laeuft ? html`<span class="fortschritt-lage">läuft …</span>` : ''}
        </p>

        <progress value="${vorgang.erledigt}" max="${vorgang.gesamt}">${anteil} %</progress>

        <p class="fortschritt-bilanz">
          ${vorgang.zugestellt} zugestellt${vorgang.fehlgeschlagen > 0
            ? html`, <span class="fehlzahl">${vorgang.fehlgeschlagen} nicht erreicht</span>`
            : ''}
        </p>

        ${vorgang.zustand === VORGANG.ABGEBROCHEN
          ? html`<p class="hinweis-warn">
              Dieser Versand wurde abgebrochen — meist, weil das Panel neu gestartet wurde.
              Die oben genannten Empfänger sind erreicht worden, die übrigen nicht.
            </p>`
          : ''}
      </div>

      ${laeuft
        ? html`<p><a href="/versand/${vorgang.id}" class="knopf-leise" data-nur-ohne-js>Stand aktualisieren</a></p>`
        : ''}

      ${nichtErreicht.length > 0
        ? html`
            <h2>Nicht erreicht</h2>
            <ul class="fehlerliste">
              ${nichtErreicht.map(
                (z) => html`
                  <li>
                    <span class="fehler-name">${z.empfaengerName ?? z.empfaengerId}</span>
                    <span class="fehler-grund">${z.grund}</span>
                  </li>
                `,
              )}
            </ul>
          `
        : ''}

      <p><a href="/nachricht?art=dm">Zurück zum Editor</a></p>
    `,
    skripte: ['/fortschritt.js'],
  });
}

export function registriereVersand(app, {
  bot, konfig, gildenAnsicht, warteschlange, versandAblage, versender, pruefeEntwurf,
  nachrichtenAblage,
}) {
  app.post('/versand/starten', verlangt(STUFE.MODERATOR), versandGrenze(), (req, res) => {
    const entwurf = entwurfAus(req.body ?? {});
    const geprueft = pruefeEntwurf(entwurf);

    if (req.body?.bestaetigt !== 'ja') {
      return res.status(422).type('html').send(
        String(
          seite({
            titel: 'Nicht bestätigt',
            pfad: '/nachricht',
            stufe: req.stufe,
            sitzung: req.sitzung,
            botStatus: bot.status(),
            inhalt: html`
              <h1>Nicht bestätigt</h1>
              <p>Ein Versand beginnt nur mit ausdrücklicher Bestätigung.</p>
              <p><a href="/nachricht?art=${entwurf.art}">Zurück zum Editor</a></p>
            `,
          }),
        ),
      );
    }

    if (!geprueft.ok) {
      return res.status(422).type('html').send(
        String(
          seite({
            titel: 'Nicht sendbar',
            pfad: '/nachricht',
            stufe: req.stufe,
            sitzung: req.sitzung,
            botStatus: bot.status(),
            inhalt: html`
              <h1>Nicht sendbar</h1>
              <ul>${geprueft.fehler.map((f) => html`<li>${f.meldung}</li>`)}</ul>
              <p><a href="/nachricht?art=${entwurf.art}">Zurück zum Editor</a></p>
            `,
          }),
        ),
      );
    }

    const nachricht = alsNachricht(entwurf);
    const akteur = { id: req.sitzung.discordUserId, name: req.sitzung.anzeigename };

    // Erst speichern, dann senden: Bricht der Versand ab, ist die Nachricht
    // wenigstens nicht verloren. Die Rückfrage hat es angekündigt.
    speichereEntwurf(nachrichtenAblage, konfig.guildId, entwurf);

    if (entwurf.art === ART.DM) {
      const aufgeloest = loeseEmpfaengerAuf(gildenAnsicht, entwurf.empfaenger, konfig.guildId);
      const { vorgangId } = warteschlange.starte(konfig.guildId, {
        nachricht,
        empfaenger: aufgeloest.empfaenger,
        akteur,
        betreff: `Direktnachricht an ${aufgeloest.anzahl}`,
        art: ART.DM,
      });
      return res.redirect(303, `/versand/${vorgangId}`);
    }

    const kanal = gildenAnsicht.findeKanal(entwurf.kanalId, konfig.guildId);
    const { vorgangId } = warteschlange.starte(konfig.guildId, {
      nachricht,
      empfaenger: [{ id: entwurf.kanalId, name: `#${kanal?.name ?? entwurf.kanalId}` }],
      akteur,
      betreff: `Kanal #${kanal?.name ?? entwurf.kanalId}`,
      art: ART.KANAL,
      // Ein Kanal ist kein Empfaenger — der Versender bekommt deshalb den
      // anderen Weg, gebunden an denselben Vorgang.
      senden: (ziel, inhalt) => versender.sendeInKanal(ziel.id, inhalt),
    });
    return res.redirect(303, `/versand/${vorgangId}`);
  });

  // Moderator, nicht Betrachter: Die Seite nennt einzelne Empfänger samt Grund,
  // warum sie nicht erreicht wurden. Das Protokoll zeigt einem Betrachter die
  // Bilanz — die Namensliste gehört zum Versand selbst.
  app.get('/versand/:id', verlangt(STUFE.MODERATOR), (req, res) => {
    const id = Number(req.params.id);
    const vorgang = Number.isInteger(id) ? versandAblage.status(konfig.guildId, id) : undefined;

    if (!vorgang) {
      return res.status(404).type('html').send(
        String(
          seite({
            titel: 'Nicht gefunden',
            pfad: '/nachricht',
            stufe: req.stufe,
            sitzung: req.sitzung,
            botStatus: bot.status(),
            inhalt: html`
              <h1>Diesen Versand gibt es nicht</h1>
              <p>Vielleicht gehört er zu einem anderen Server, oder er wurde gelöscht.</p>
            `,
          }),
        ),
      );
    }

    const ziele = versandAblage.ziele(konfig.guildId, id);
    return res.type('html').send(String(fortschrittSeite({ req, bot, vorgang, ziele })));
  });
}
