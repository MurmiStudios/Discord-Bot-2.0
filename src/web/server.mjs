import express from 'express';
import { registriereAnmeldung, sitzungsMiddleware } from './seiten/anmeldung.mjs';
import { stufenMiddleware, verlangt } from './mw/verlangt.mjs';
import { csrfSchutz, csrfFeld } from '../auth/csrf.mjs';
import { sicherheitsKoepfe, allgemeineGrenze, anmeldeGrenze } from './mw/sicherheit.mjs';
import { STUFE } from '../auth/rechte.mjs';

/**
 * Baut die Express-App auf. Bewusst ohne `listen` — so kann jeder Test die App
 * auf einem freien Port starten und danach wieder herunterfahren.
 */
export function erstelleApp({ konfig, db, gilden, sitzungen, oauth, logger, zugriff, mitgliedschaft }) {
  const app = express();

  // Verraet sonst in jeder Antwort, dass hier Express laeuft.
  app.disable('x-powered-by');

  // Ohne das haelt Express hinter einem Reverse Proxy jede Verbindung fuer
  // unverschluesselt — und das Secure-Cookie kaeme nie zustande.
  if (konfig.vertraueProxy) app.set('trust proxy', 1);

  app.use(sicherheitsKoepfe(konfig));
  app.use(allgemeineGrenze());
  // Eigene, strengere Grenze fuer den Anmeldeweg.
  app.use(['/login', '/auth'], anmeldeGrenze());

  app.use(express.urlencoded({ extended: false, limit: '1mb' }));
  app.use(sitzungsMiddleware(sitzungen));
  app.use(stufenMiddleware({ konfig, zugriff, mitgliedschaft }));
  app.use(csrfSchutz);

  registriereAnmeldung(app, { konfig, db, gilden, sitzungen, oauth, logger });

  // Vorlaeufige Uebersicht. Schritt 56 baut die richtige.
  app.get('/', verlangt(STUFE.BETRACHTER), (req, res) => {
    res.type('html').send(
      '<!doctype html>\n<html lang="de">\n<head><meta charset="utf-8">' +
        '<title>Übersicht · Discord-Panel</title></head>\n<body>\n' +
        '<h1>Panel läuft</h1>\n' +
        `<p>Angemeldet als ${req.sitzung.anzeigename ?? req.sitzung.discordUserId}.</p>\n` +
        `<form method="post" action="/logout">${csrfFeld(req)}` +
        '<button type="submit">Abmelden</button></form>\n' +
        '</body>\n</html>\n',
    );
  });

  return app;
}
