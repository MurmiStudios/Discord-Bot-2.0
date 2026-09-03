import { html } from '../html/html.mjs';
import { seite } from '../html/layout.mjs';
import { verlangt } from '../mw/verlangt.mjs';
import { STUFE } from '../../auth/rechte.mjs';
import { csrfFeld } from '../../auth/csrf.mjs';
import { istLeer } from '../../nachricht/modell.mjs';
import { entwurfAus, alsAblage, alsEingabe, alsNachricht } from '../../nachricht/entwurf.mjs';
import { pruefeNachricht } from '../../nachricht/pruefen.mjs';
import { textfeld, embedteil, bildwahl, vorschauteil, fehlerZu } from '../html/baukasten.mjs';
import { zwischenschritt, aktivAus } from './zwischenschritt.mjs';
import { alsZeitpunkt } from '../html/zeit.mjs';
import { bestaetigungsSeite } from './versand.mjs';
import { loeseEmpfaengerAuf, parseAuswahl } from '../../versand/empfaenger.mjs';

/**
 * Nachrichten, die am Erhalt einer Rolle hängen.
 *
 * Zur Rollenauswahl: Die Pillen sind Verweise, keine Formularelemente. Die
 * Abnahme sah Formularelemente vor — aber das Umschalten wechselt hier nicht
 * eine Einstellung, sondern *welche Nachricht man bearbeitet*. Als Formular
 * müsste es den getippten Text mitnehmen, und der gehört zur vorigen Rolle;
 * ihn nach nebenan zu tragen wäre schlimmer als ihn zu verlieren. Als Verweis
 * ist die gewählte Rolle ausserdem in der Adresse, lässt sich verlinken und
 * übersteht ein Neuladen. Tastatur und Screenreader können Verweise ohnehin.
 *
 * Der Punkt an der Pille sagt den Zustand: gefüllt heisst aktiv, hohl heisst
 * hinterlegt, aber ausgeschaltet. Eine Rolle ohne Punkt hat nichts.
 */

function rollenpillen(rollen, stand, gewaehlt) {
  return html`
    <nav class="rollenpillen" aria-label="Rolle auswählen">
      ${rollen.map((rolle) => {
        const eintrag = stand.get(rolle.id);
        const lage = !eintrag ? 'leer' : eintrag.aktiv ? 'aktiv' : 'ruht';
        const titel = {
          leer: 'Noch keine Nachricht hinterlegt',
          aktiv: 'Aktiv — der Rollenerhalt löst sie aus',
          ruht: 'Hinterlegt, aber ausgeschaltet',
        }[lage];

        return html`
          <a href="/rollen-nachrichten?rolle=${rolle.id}"
             class="rollenpille${rolle.id === gewaehlt ? ' rollenpille-aktiv' : ''}"
             ${rolle.id === gewaehlt ? html`aria-current="true"` : ''}
             title="${rolle.name} — ${titel}">
            <span class="rollenpunkt rollenpunkt-${lage}" aria-hidden="true"></span>
            ${rolle.name}
            <span class="nur-fuer-vorleser">— ${titel}</span>
          </a>
        `;
      })}
    </nav>
  `;
}

function editorSeite({ req, bot, rollen, stand, rolle, entwurf, aktiv, eintrag, vorlagen, fehler = [], hinweis = null }) {
  return seite({
    titel: 'Rollen-Nachrichten',
    pfad: '/rollen-nachrichten',
    stufe: req.stufe,
    sitzung: req.sitzung,
    botStatus: bot.status(),
    inhalt: html`
      <h1>Rollen-Nachrichten</h1>
      <p class="unterzeile">
        Eine Nachricht je Rolle. Sie geht als Direktnachricht raus, sobald jemand
        diese Rolle bekommt.
      </p>

      ${rollen.length === 0
        ? html`<p class="leer">
            Der Bot sieht auf diesem Server keine Rollen. Ist er verbunden und eingeladen?
          </p>`
        : rollenpillen(rollen, stand, rolle?.id)}

      ${hinweis ? html`<p class="hinweis-gut">${hinweis}</p>` : ''}

      ${!rolle
        ? html`<p class="leer">
            Wähle oben eine Rolle. Für jede lässt sich genau eine Nachricht hinterlegen —
            wer die Rolle bekommt, bekommt sie.
          </p>`
        : html`
            <form method="post" action="/rollen-nachrichten" class="editor">
              ${csrfFeld(req)}
              <input type="hidden" name="art" value="dm">
              <input type="hidden" name="rollenId" value="${rolle.id}">

              <h2>Nachricht für „${rolle.name}“</h2>

              <div class="schalterzeile">
                <label class="haken">
                  <input type="hidden" name="aktiv" value="nein">
                  <input type="checkbox" name="aktiv" value="ja"${aktiv ? html` checked` : ''}>
                  Aktiv — beim Erhalt dieser Rolle verschicken
                </label>
                <span class="schalterlage">
                  ${aktiv
                    ? html`<span class="lage-an">Läuft.</span> Wer „${rolle.name}“ bekommt, bekommt sie.`
                    : html`<span class="lage-aus">Ausgeschaltet.</span> Alles bleibt gespeichert,
                        es geht nur nichts raus.`}
                </span>
              </div>
              ${fehlerZu(fehler, 'aktiv')}

              ${textfeld(entwurf, fehler)}
              <p class="hinweis">
                <code>{role}</code> steht hier für „${rolle.name}“ — die Rolle, die den Versand
                ausgelöst hat.
              </p>

              ${embedteil(entwurf, fehler)}
              ${bildwahl(entwurf, vorlagen)}
              ${vorschauteil(entwurf, { nachricht: alsNachricht(entwurf) })}

              <div class="editor-fuss">
                <button type="submit" name="sichern" value="ja" class="knopf-haupt">Speichern</button>
                <button type="submit" name="anAlle" value="ja" class="knopf-leise">
                  Jetzt an alle mit dieser Rolle …
                </button>
                <span class="hinweis">
                  „Jetzt an alle“ speichert zuerst und fragt dann nach. Es ist einmalig —
                  die Automatik läuft davon unabhängig weiter.
                </span>
                ${eintrag?.geaendertAm
                  ? html`<span class="hinweis">
                      Zuletzt geändert ${alsZeitpunkt(eintrag.geaendertAm)}.
                    </span>`
                  : ''}
              </div>
            </form>
          `}
    `,
    skripte: ['/editor.js'],
  });
}

/** Wie bei der Willkommensnachricht: leer darf sein, aktiv und leer nicht. */
export function pruefeRollenNachricht(entwurf, aktiv, rollenName) {
  const geprueft = pruefeNachricht(alsEingabe(entwurf), { darfLeerSein: true });
  const fehler = [...(geprueft.fehler ?? [])];

  if (aktiv && istLeer(alsNachricht(entwurf))) {
    fehler.push({
      feld: 'aktiv',
      meldung:
        `Ohne Text, Embed-Karte und Bildvorlage gibt es nichts zu verschicken. Schreib etwas, ` +
        `oder nimm den Haken bei „Aktiv“ heraus — dann bleibt für „${rollenName}“ alles stehen.`,
    });
  }

  return { ok: fehler.length === 0, fehler };
}

export function registriereRollenNachrichten(
  app, { bot, konfig, rollenNachrichten, gildenAnsicht, bildvorlagen },
) {
  const vorlagenliste = () =>
    bildvorlagen ? bildvorlagen.alle(konfig.guildId).map((v) => ({ id: v.id, name: v.name })) : [];

  /** Rollen-ID → gespeicherter Stand, für die Punkte an den Pillen. */
  const standKarte = () =>
    new Map(rollenNachrichten.alle(konfig.guildId).map((e) => [e.rollenId, e]));

  const zeige = (req, res, { rolle, entwurf, aktiv, eintrag, fehler = [], hinweis = null, lage = 200 }) =>
    res.status(lage).type('html').send(
      String(editorSeite({
        req, bot,
        rollen: gildenAnsicht.rollen(konfig.guildId),
        stand: standKarte(),
        rolle, entwurf, aktiv, eintrag,
        vorlagen: vorlagenliste(),
        fehler, hinweis,
      })),
    );

  app.get('/rollen-nachrichten', verlangt(STUFE.MODERATOR), (req, res) => {
    const gewaehlt = req.query.rolle ? String(req.query.rolle) : null;
    // Eine Rolle, die es nicht gibt, führt zur Auswahl zurück statt zu einem
    // Editor, dessen Speichern nirgends ankäme.
    const rolle = gewaehlt ? gildenAnsicht.findeRolle(gewaehlt, konfig.guildId) : undefined;

    if (!rolle) {
      return zeige(req, res, {
        rolle: null, entwurf: entwurfAus({ art: 'dm' }), aktiv: false, eintrag: null,
      });
    }

    const eintrag = rollenNachrichten.fuerRolle(konfig.guildId, rolle.id);
    return zeige(req, res, {
      rolle,
      entwurf: entwurfAus({ ...eintrag.daten, art: 'dm' }),
      aktiv: eintrag.aktiv,
      eintrag,
      fehler: eintrag.beschaedigt
        ? [{ feld: 'text', meldung: 'Die gespeicherte Fassung war nicht lesbar — hier steht eine leere.' }]
        : [],
    });
  });

  app.post('/rollen-nachrichten', verlangt(STUFE.MODERATOR), (req, res) => {
    const koerper = req.body ?? {};
    const rolle = gildenAnsicht.findeRolle(String(koerper.rollenId ?? ''), konfig.guildId);

    if (!rolle) {
      return res.status(404).type('html').send(
        String(
          seite({
            titel: 'Rolle nicht gefunden',
            pfad: '/rollen-nachrichten',
            stufe: req.stufe,
            sitzung: req.sitzung,
            botStatus: bot.status(),
            inhalt: html`
              <h1>Diese Rolle gibt es nicht mehr</h1>
              <p>Sie wurde auf Discord gelöscht, während die Seite offen war.</p>
              <p><a href="/rollen-nachrichten">Zurück zur Auswahl</a></p>
            `,
          }),
        ),
      );
    }

    const entwurf = entwurfAus({ ...koerper, art: 'dm' });
    const aktiv = aktivAus(koerper);
    const eintrag = rollenNachrichten.fuerRolle(konfig.guildId, rolle.id);

    if (zwischenschritt(koerper, entwurf)) {
      return zeige(req, res, { rolle, entwurf, aktiv, eintrag });
    }

    const geprueft = pruefeRollenNachricht(entwurf, aktiv, rolle.name);
    if (!geprueft.ok) {
      return zeige(req, res, { rolle, entwurf, aktiv, eintrag, fehler: geprueft.fehler, lage: 422 });
    }

    rollenNachrichten.sichere(konfig.guildId, rolle.id, { aktiv, daten: alsAblage(entwurf) });

    // „Jetzt an alle“ speichert zuerst: Sonst ginge eine andere Fassung raus,
    // als auf dem Bildschirm steht.
    if (koerper.anAlle !== undefined) {
      const anAlle = entwurfAus({
        ...alsAblage(entwurf),
        art: 'dm',
        empfaenger: [`rolle:${rolle.id}`],
        rollenKontext: rolle.id,
      });
      const aufgeloest = loeseEmpfaengerAuf(gildenAnsicht, parseAuswahl([`rolle:${rolle.id}`]), konfig.guildId);

      if (aufgeloest.anzahl === 0) {
        return zeige(req, res, {
          rolle, entwurf, aktiv, eintrag, lage: 422,
          fehler: [{
            feld: 'aktiv',
            meldung: `Gespeichert — aber „${rolle.name}“ hat niemanden. Es gäbe nichts zu verschicken.`,
          }],
        });
      }

      return res.type('html').send(
        String(bestaetigungsSeite({ req, bot, konfig, entwurf: anAlle, aufgeloest, ziel: rolle.name })),
      );
    }

    return zeige(req, res, {
      rolle, entwurf, aktiv,
      eintrag: rollenNachrichten.fuerRolle(konfig.guildId, rolle.id),
      hinweis: aktiv
        ? `Gespeichert und aktiv. Wer „${rolle.name}“ bekommt, bekommt sie.`
        : 'Gespeichert. Sie geht erst raus, wenn du sie aktivierst.',
    });
  });
}
