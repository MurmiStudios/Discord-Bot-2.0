import { bestimmeStufe, reichtAus, STUFE } from '../../auth/rechte.mjs';
import { csrfFeld } from '../../auth/csrf.mjs';

/** Marke fuer Routen, die absichtlich ohne Anmeldung erreichbar sind. */
export const OEFFENTLICH = 'OEFFENTLICH';

function abweisen(req, res) {
  // Nennt bewusst keine Seitennamen: Wer keinen Zugriff hat, soll auch nicht
  // erfahren, was es hinter der Abweisung ueberhaupt gibt.
  return res
    .status(403)
    .type('html')
    .send(
      '<!doctype html>\n<html lang="de">\n<head><meta charset="utf-8">' +
        '<title>Kein Zugriff · Discord-Panel</title></head>\n<body>\n' +
        '<h1>Du hast hier keinen Zugriff</h1>\n' +
        '<p>Dein Discord-Konto ist für dieses Panel nicht freigeschaltet. Wenn das\n' +
        'ein Versehen ist, wende dich an die Person, die das Panel betreibt.</p>\n' +
        `<form method="post" action="/logout">${csrfFeld(req)}` +
        '<button type="submit">Abmelden</button></form>\n' +
        '</body>\n</html>\n',
    );
}

/**
 * Verlangt mindestens die angegebene Stufe.
 *
 * Die Stufe haengt als Eigenschaft an der Middleware, damit `routenUebersicht`
 * sie auslesen kann — daher ist das keine anonyme Pfeilfunktion.
 */
export function verlangt(stufe) {
  const pruefung = (req, res, next) => {
    if (!req.sitzung) return res.redirect(302, '/login');
    if (!reichtAus(req.stufe, stufe)) return abweisen(req, res);
    return next();
  };
  pruefung.stufe = stufe;
  return pruefung;
}

/** Ausdrueckliche Erklaerung, dass eine Route ohne Anmeldung erreichbar sein soll. */
export function oeffentlich() {
  const durchlassen = (_req, _res, next) => next();
  durchlassen.stufe = OEFFENTLICH;
  return durchlassen;
}

/**
 * Bestimmt bei jeder Anfrage die aktuelle Stufe neu — aus der Sitzung, den
 * jetzigen Rollen auf dem Server und der Zuordnungstabelle. Nichts davon liegt
 * in der Sitzung, deshalb wirkt eine entzogene Rolle sofort.
 */
export function stufenMiddleware({ konfig, zugriff, mitgliedschaft }) {
  return (req, _res, next) => {
    if (!req.sitzung) {
      req.stufe = STUFE.KEIN_ZUGRIFF;
      return next();
    }

    const rollenIds = mitgliedschaft.rollenVon(konfig.guildId, req.sitzung.discordUserId);
    req.stufe = bestimmeStufe({
      discordUserId: req.sitzung.discordUserId,
      ownerId: konfig.ownerId,
      rollenIds,
      stufeFuerRollen: (rollen) => zugriff.stufeFuerRollen(konfig.guildId, rollen),
    });
    return next();
  };
}
