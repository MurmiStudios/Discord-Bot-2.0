import busboy from 'busboy';

/**
 * Liest ein Formular mit Dateianhang.
 *
 * Läuft neben `express.urlencoded` und aus demselben Grund an derselben Stelle:
 * Der CSRF-Schutz liest sein Token aus dem Formularkörper, also muss der Körper
 * vorher gelesen sein. Ein Formular ohne Dateianhang geht unberührt weiter.
 *
 * Das Ergebnis sieht aus wie das von `express.urlencoded`: `req.body` mit
 * Zeichenketten, wiederholte Felder als Liste. Die Datei landet als Puffer in
 * `req.datei` — geschrieben wird sie hier nicht, das tut `pruefeUpload`, nachdem
 * es den Inhalt geprüft hat.
 *
 * Alle Grenzen stehen in `limits`. Ohne sie könnte eine einzige Anfrage den
 * Arbeitsspeicher füllen; Busboy bricht so schon beim Lesen ab.
 */
export function hochladen({ maxBytes }) {
  return function multipartLesen(req, res, next) {
    if (!req.is('multipart/form-data')) return next();

    let leser;
    try {
      leser = busboy({
        headers: req.headers,
        limits: {
          files: 1,
          // Ein Byte mehr als erlaubt: So schlaegt die Grenze zu, statt dass
          // eine gerade noch zu grosse Datei unbemerkt durchgeht.
          fileSize: maxBytes + 1,
          fields: 400,
          fieldSize: 1_000_000,
          parts: 500,
        },
      });
    } catch {
      return antworte(res, 'Dieses Formular konnte nicht gelesen werden.');
    }

    const koerper = Object.create(null);
    const merke = (name, wert) => {
      if (name in koerper) {
        koerper[name] = Array.isArray(koerper[name]) ? [...koerper[name], wert] : [koerper[name], wert];
      } else {
        koerper[name] = wert;
      }
    };

    const stuecke = [];
    let fertig = false;

    const abbrechen = (meldung) => {
      if (fertig) return;
      fertig = true;
      req.unpipe(leser);
      leser.removeAllListeners();
      req.resume();
      antworte(res, meldung);
    };

    leser.on('field', (name, wert) => merke(name, wert));

    leser.on('file', (name, strom, info) => {
      req.dateiFeld = name;
      req.dateiName = info.filename;
      strom.on('data', (stueck) => stuecke.push(stueck));
      strom.on('limit', () => {
        req.dateiZuGross = true;
        stuecke.length = 0;
        strom.resume();
      });
    });

    leser.on('filesLimit', () => abbrechen('Es kann nur eine Datei auf einmal hochgeladen werden.'));
    leser.on('fieldsLimit', () => abbrechen('Dieses Formular hat zu viele Felder.'));
    leser.on('partsLimit', () => abbrechen('Dieses Formular hat zu viele Teile.'));
    leser.on('error', () => abbrechen('Dieses Formular konnte nicht gelesen werden.'));

    leser.on('close', () => {
      if (fertig) return;
      fertig = true;
      req.body = koerper;
      req.datei = stuecke.length > 0 ? Buffer.concat(stuecke) : null;
      next();
    });

    return req.pipe(leser);
  };
}

function antworte(res, meldung) {
  return res
    .status(400)
    .type('html')
    .send(
      '<!doctype html>\n<html lang="de">\n<head><meta charset="utf-8">' +
        '<title>Nicht lesbar · Discord-Panel</title></head>\n<body>\n' +
        '<h1>Dieses Formular konnte nicht gelesen werden</h1>\n' +
        `<p>${meldung}</p>\n` +
        '<p><a href="/vorlagen">Zurück zu den Bildvorlagen</a></p>\n' +
        '</body>\n</html>\n',
    );
}
