import { gleichSicher } from './sitzung.mjs';

const SCHREIBEND = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
export const CSRF_FELD = '_csrf';

/**
 * Schuetzt jeden schreibenden Aufruf mit einem Token aus der Sitzung.
 *
 * Eine fremde Seite kann das Cookie zwar mitschicken lassen, aber den Inhalt
 * der Sitzung nicht lesen — und damit das Token nicht mitliefern. Verglichen
 * wird zeitkonstant, sonst verriete die Laufzeit den richtigen Wert Zeichen
 * fuer Zeichen.
 */
export function csrfSchutz(req, res, next) {
  if (!SCHREIBEND.has(req.method)) return next();

  // Ohne Sitzung gibt es nichts zu faelschen: Der Aufruf hat ohnehin keine
  // Rechte, und die Rechtepruefung weist ihn gleich danach ab.
  if (!req.sitzung) return next();

  const mitgeliefert = req.body?.[CSRF_FELD];
  if (typeof mitgeliefert === 'string' && gleichSicher(mitgeliefert, req.sitzung.csrfToken)) {
    return next();
  }

  return res
    .status(403)
    .type('html')
    .send(
      '<!doctype html>\n<html lang="de">\n<head><meta charset="utf-8">' +
        '<title>Abgelaufen · Discord-Panel</title></head>\n<body>\n' +
        '<h1>Dieser Vorgang konnte nicht ausgeführt werden</h1>\n' +
        '<p>Das Formular gehört nicht zu deiner aktuellen Sitzung. Meist liegt das\n' +
        'daran, dass die Seite lange offen war. Lade sie neu geladen und versuche es\n' +
        'noch einmal.</p>\n' +
        '<p><a href="/">Zurück zur Übersicht</a></p>\n' +
        '</body>\n</html>\n',
    );
}

/** Verstecktes Feld fuer jedes schreibende Formular. */
export function csrfFeld(req) {
  const token = req.sitzung?.csrfToken ?? '';
  return `<input type="hidden" name="${CSRF_FELD}" value="${token}">`;
}
