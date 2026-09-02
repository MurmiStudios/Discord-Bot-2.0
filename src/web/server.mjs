import express from 'express';
import { registriereAnmeldung, sitzungsMiddleware } from './seiten/anmeldung.mjs';
import { registriereSuche } from './seiten/suche.mjs';
import { registriereNachricht, erstellePruefung } from './seiten/nachricht.mjs';
import { registriereVersand } from './seiten/versand.mjs';
import { stufenMiddleware, verlangt } from './mw/verlangt.mjs';
import { csrfSchutz } from '../auth/csrf.mjs';
import { seite } from './html/layout.mjs';
import { html } from './html/html.mjs';
import { sicherheitsKoepfe, allgemeineGrenze, anmeldeGrenze } from './mw/sicherheit.mjs';
import { registriereStatisch } from './statisch.mjs';
import { STUFE } from '../auth/rechte.mjs';

/**
 * Baut die Express-App auf. Bewusst ohne `listen` — so kann jeder Test die App
 * auf einem freien Port starten und danach wieder herunterfahren.
 */
export function erstelleApp({
  konfig, db, gilden, sitzungen, oauth, logger, zugriff, mitgliedschaft, gildenAnsicht,
  warteschlange, versandAblage, versender,
  bot = { status: () => ({ verbunden: false, grund: 'Der Bot ist nicht eingerichtet.' }) },
}) {
  const app = express();

  // Verraet sonst in jeder Antwort, dass hier Express laeuft.
  app.disable('x-powered-by');

  // Ohne das haelt Express hinter einem Reverse Proxy jede Verbindung fuer
  // unverschluesselt — und das Secure-Cookie kaeme nie zustande.
  if (konfig.vertraueProxy) app.set('trust proxy', 1);

  app.use(sicherheitsKoepfe(konfig));

  // Vor der Ratenbegrenzung: Eine Seite laedt mehrere Dateien, die sollen die
  // Grenze fuer echte Seitenaufrufe nicht verbrauchen.
  registriereStatisch(app);

  app.use(allgemeineGrenze());
  // Eigene, strengere Grenze fuer den Anmeldeweg.
  app.use(['/login', '/auth'], anmeldeGrenze());

  app.use(express.urlencoded({ extended: false, limit: '1mb' }));
  app.use(sitzungsMiddleware(sitzungen));
  app.use(stufenMiddleware({ konfig, zugriff, mitgliedschaft }));
  app.use(csrfSchutz);

  registriereAnmeldung(app, { konfig, db, gilden, sitzungen, oauth, logger });
  registriereSuche(app, { bot });
  registriereNachricht(app, { bot, konfig, gildenAnsicht });
  if (warteschlange && versandAblage && versender) {
    registriereVersand(app, {
      bot, konfig, gildenAnsicht, warteschlange, versandAblage, versender,
      pruefeEntwurf: erstellePruefung({ konfig, gildenAnsicht }),
    });
  }

  // Vorlaeufige Uebersicht. Schritt 56 baut die richtige.
  app.get('/', verlangt(STUFE.BETRACHTER), (req, res) => {
    res.type('html').send(
      String(
        seite({
          titel: 'Übersicht',
          pfad: '/',
          stufe: req.stufe,
          sitzung: req.sitzung,
          botStatus: bot.status(),
          inhalt: html`
            <h1>Panel läuft</h1>
            <p>Angemeldet als ${req.sitzung.anzeigename ?? req.sitzung.discordUserId}.</p>
            <p>Die Übersicht mit Kennzahlen entsteht in Schritt 56.</p>
          `,
        }),
      ),
    );
  });

  return app;
}
