import { html } from '../html/html.mjs';
import { seite } from '../html/layout.mjs';
import { verlangt } from '../mw/verlangt.mjs';
import { STUFE } from '../../auth/rechte.mjs';
import { csrfFeld } from '../../auth/csrf.mjs';
import { GRENZE, istLeer } from '../../nachricht/modell.mjs';
import { entwurfAus, alsAblage, alsEingabe, alsNachricht } from '../../nachricht/entwurf.mjs';
import { pruefeNachricht } from '../../nachricht/pruefen.mjs';
import { textfeld, embedteil, bildwahl, vorschauteil, fehlerZu } from '../html/baukasten.mjs';
import { MODUS } from '../../nachricht/vorschau.mjs';
import { zerlegeKnopfwert, fuegeEin } from '../../nachricht/platzhalterziel.mjs';
import { PLATZHALTER } from '../../nachricht/platzhalter.mjs';
import { klartext } from '../../discord/fehler.mjs';

/**
 * Die Willkommensnachricht.
 *
 * Derselbe Baukasten wie im Nachrichteneditor — Text, Variablen, Embed,
 * Bildvorlage, Vorschau. Was fehlt, ist die Empfängerwahl: Der Empfänger steht
 * schon fest, es ist die Person, die gerade beigetreten ist.
 *
 * Der Aktiv-Schalter löscht nichts. Wer eine Willkommensnachricht für den
 * Sommer schreibt und im Herbst abschaltet, will sie im nächsten Sommer
 * wiederhaben — deshalb bleibt beim Ausschalten alles stehen und geht nur nicht
 * mehr raus.
 *
 * Aktiv und leer ist dagegen keine gültige Einstellung: Das sähe aus, als sei
 * etwas eingerichtet, und beim ersten Beitritt passierte nichts. Der Fall wird
 * benannt und abgelehnt.
 */

const ERLAUBTE_PLATZHALTER = new Set(PLATZHALTER.map((p) => p.name));

/** Die Vorschau soll die Lage zeigen, in der die Nachricht wirklich ankommt. */
const HINWEIS_PLATZHALTER = html`
  <p class="hinweis">
    <code>{user}</code> und <code>{tag}</code> stehen für die Person, die beitritt,
    <code>{count}</code> für die Mitgliederzahl danach. <code>{role}</code> bleibt leer —
    beim Beitritt gibt es noch keine auslösende Rolle.
  </p>
`;

function editorSeite({ req, bot, entwurf, aktiv, vorlagen, fehler = [], hinweis = null }) {
  return seite({
    titel: 'Willkommen',
    pfad: '/willkommen',
    stufe: req.stufe,
    sitzung: req.sitzung,
    botStatus: bot.status(),
    inhalt: html`
      <h1>Willkommensnachricht</h1>
      <p class="unterzeile">
        Geht als Direktnachricht an jede Person, die dem Server beitritt.
      </p>

      ${hinweis ? html`<p class="hinweis-gut">${hinweis}</p>` : ''}

      <form method="post" action="/willkommen" class="editor">
        ${csrfFeld(req)}
        <input type="hidden" name="art" value="dm">

        <div class="schalterzeile">
          <label class="haken">
            <input type="hidden" name="aktiv" value="nein">
            <input type="checkbox" name="aktiv" value="ja"${aktiv ? html` checked` : ''}>
            Aktiv — beim Beitritt verschicken
          </label>
          <span class="schalterlage">
            ${aktiv
              ? html`<span class="lage-an">Läuft.</span> Jeder Beitritt löst sie aus.`
              : html`<span class="lage-aus">Ausgeschaltet.</span> Alles bleibt gespeichert,
                  es geht nur nichts raus.`}
          </span>
        </div>
        ${fehlerZu(fehler, 'aktiv')}

        ${textfeld(entwurf, fehler)}
        ${HINWEIS_PLATZHALTER}

        ${embedteil(entwurf, fehler)}

        ${bildwahl(entwurf, vorlagen)}
        ${vorschauteil(entwurf, { nachricht: alsNachricht(entwurf) })}

        <!-- Nach der Vorschau: Erst sehen, was rausgeht, dann speichern. -->
        <div class="editor-fuss">
          <button type="submit" name="sichern" value="ja" class="knopf-haupt">Speichern</button>
          <button type="submit" name="testen" value="ja" class="knopf-leise">
            Test-DM an mich
          </button>
          <span class="hinweis">
            Der Test speichert zuerst und schickt dann genau das, was beim nächsten
            Beitritt rausginge — an dein eigenes Konto, mit deinem Profilbild.
          </span>
        </div>
      </form>
    `,
    skripte: ['/editor.js'],
  });
}

/**
 * Prüft, ob sich das so speichern lässt.
 *
 * Inhaltlich leer ist erlaubt, solange nichts aktiv ist — man fängt ja
 * irgendwo an. Aktiv und leer ist es nicht.
 */
export function pruefeWillkommen(entwurf, aktiv) {
  // Leer ist beim Speichern in Ordnung — man fängt ja irgendwo an. Die Grenzen
  // für Länge und Embed gelten trotzdem.
  const geprueft = pruefeNachricht(alsEingabe(entwurf), { darfLeerSein: true });
  const fehler = [...(geprueft.fehler ?? [])];

  if (aktiv && istLeer(alsNachricht(entwurf))) {
    fehler.push({
      feld: 'aktiv',
      meldung:
        'Ohne Text, Embed-Karte und Bildvorlage gibt es nichts zu verschicken. ' +
        'Schreib etwas, oder nimm den Haken bei „Aktiv" heraus.',
    });
  }

  return { ok: fehler.length === 0, fehler };
}

export function registriereWillkommen(
  app, { bot, konfig, willkommen, bildvorlagen, versender },
) {
  const vorlagenliste = () =>
    bildvorlagen ? bildvorlagen.alle(konfig.guildId).map((v) => ({ id: v.id, name: v.name })) : [];

  const zeige = (req, res, entwurf, aktiv, { fehler = [], hinweis = null, lage = 200 } = {}) =>
    res.status(lage).type('html').send(
      String(editorSeite({ req, bot, entwurf, aktiv, vorlagen: vorlagenliste(), fehler, hinweis })),
    );

  /**
   * Schickt den eben gespeicherten Stand an das eigene Konto.
   *
   * Über denselben Versender wie die Automatik — inklusive Bildvorlage mit dem
   * eigenen Profilbild. Ein Test, der einen anderen Weg nähme, prüfte nicht
   * das, was später wirklich passiert.
   */
  async function testeAnMich(req, res, entwurf, aktiv) {
    const nachricht = alsNachricht(entwurf);

    if (istLeer(nachricht)) {
      return zeige(req, res, entwurf, aktiv, {
        lage: 422,
        fehler: [{
          feld: 'text',
          meldung: 'Gespeichert — aber es gibt nichts zu verschicken. Schreib erst etwas.',
        }],
      });
    }

    const ich = { id: req.sitzung.discordUserId, name: req.sitzung.anzeigename };

    try {
      await versender.sendeDm(ich, nachricht);
      return zeige(req, res, entwurf, aktiv, {
        hinweis: 'Gespeichert und als Test an dich verschickt. Sieh in deinen Direktnachrichten nach.',
      });
    } catch (fehler) {
      return zeige(req, res, entwurf, aktiv, {
        lage: 502,
        fehler: [{
          feld: 'aktiv',
          meldung: `Gespeichert, aber der Test kam nicht an: ${klartext(fehler)}`,
        }],
      });
    }
  }

  app.get('/willkommen', verlangt(STUFE.MODERATOR), (req, res) => {
    const stand = willkommen.lies(konfig.guildId);
    return zeige(req, res, entwurfAus(stand.daten), stand.aktiv, {
      hinweis: null,
      fehler: stand.beschaedigt
        ? [{ feld: 'text', meldung: 'Die gespeicherte Fassung war nicht lesbar — hier steht eine leere.' }]
        : [],
    });
  });

  app.post('/willkommen', verlangt(STUFE.MODERATOR), async (req, res, next) => {
    const koerper = req.body ?? {};
    const entwurf = entwurfAus({ ...koerper, art: 'dm' });
    const aktiv = (Array.isArray(koerper.aktiv) ? koerper.aktiv : [koerper.aktiv]).includes('ja');

    if (koerper.embedUmschalten !== undefined) {
      entwurf.embedAn = !entwurf.embedAn;
      return zeige(req, res, entwurf, aktiv);
    }

    if (koerper.feldHinzufuegen !== undefined) {
      if (entwurf.embed.felder.length < GRENZE.FELDER) entwurf.embed.felder.push({ name: '', wert: '' });
      return zeige(req, res, entwurf, aktiv);
    }

    if (koerper.feldEntfernen !== undefined) {
      const index = Number(koerper.feldEntfernen);
      if (Number.isInteger(index) && index >= 0 && index < entwurf.embed.felder.length) {
        entwurf.embed.felder.splice(index, 1);
      }
      return zeige(req, res, entwurf, aktiv);
    }

    if (koerper.platzhalterEinfuegen !== undefined) {
      const geklickt = zerlegeKnopfwert(koerper.platzhalterEinfuegen);
      if (geklickt && ERLAUBTE_PLATZHALTER.has(geklickt.platzhalter)) {
        fuegeEin(entwurf, geklickt.ziel, geklickt.platzhalter);
      }
      return zeige(req, res, entwurf, aktiv);
    }

    if (koerper.vorschauWechseln !== undefined) {
      entwurf.vorschauModus = koerper.vorschauWechseln === MODUS.ROH ? MODUS.ROH : MODUS.BEISPIEL;
      return zeige(req, res, entwurf, aktiv);
    }

    if (koerper.vorschauErneuern !== undefined) return zeige(req, res, entwurf, aktiv);

    const geprueft = pruefeWillkommen(entwurf, aktiv);
    if (!geprueft.ok) {
      return zeige(req, res, entwurf, aktiv, { fehler: geprueft.fehler, lage: 422 });
    }

    willkommen.sichere(konfig.guildId, { aktiv, daten: alsAblage(entwurf) });

    // Der Test speichert zuerst. „Der gespeicherte Stand" und „was ich gerade
    // getippt habe" sind damit dasselbe — sonst prüfte man eine alte Fassung
    // und wunderte sich.
    if (koerper.testen !== undefined) {
      try {
        return await testeAnMich(req, res, entwurf, aktiv);
      } catch (unerwartet) {
        return next(unerwartet);
      }
    }

    return zeige(req, res, entwurf, aktiv, {
      hinweis: aktiv
        ? 'Gespeichert und aktiv. Der nächste Beitritt löst sie aus.'
        : 'Gespeichert. Sie geht erst raus, wenn du sie aktivierst.',
    });
  });
}
