import express from 'express';

/**
 * Baut die Express-App auf. Bewusst ohne `listen` — so kann jeder Test die App
 * auf einem freien Port starten und danach wieder herunterfahren.
 */
export function erstelleApp() {
  const app = express();

  // Verraet sonst in jeder Antwort, dass hier Express laeuft.
  app.disable('x-powered-by');

  app.get('/', (_req, res) => {
    res.type('html').send(
      '<!doctype html>\n' +
        '<html lang="de">\n' +
        '<head><meta charset="utf-8"><title>Discord-Panel</title></head>\n' +
        '<body><h1>Panel läuft</h1></body>\n' +
        '</html>\n',
    );
  });

  return app;
}
