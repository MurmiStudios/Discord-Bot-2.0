import { html } from '../html/html.mjs';
import { seite, NAVIGATION } from '../html/layout.mjs';
import { verlangt } from '../mw/verlangt.mjs';
import { STUFE, reichtAus } from '../../auth/rechte.mjs';

/**
 * Seitensuche.
 *
 * Ohne JavaScript ist das ein gewöhnliches Suchformular, das auf eine
 * Trefferseite führt — und bei genau einem Treffer gleich dorthin springt.
 * `suche.js` macht daraus danach eine Sofortsuche, ohne einen zweiten
 * Codepfad zu eröffnen: Gefiltert wird dieselbe Liste.
 */
export function registriereSuche(app, { bot }) {
  app.get('/suche', verlangt(STUFE.BETRACHTER), (req, res) => {
    const begriff = String(req.query.q ?? '').trim();
    const gesucht = begriff.toLowerCase();

    const treffer = NAVIGATION.filter((eintrag) => reichtAus(req.stufe, eintrag.stufe)).filter(
      (eintrag) => gesucht === '' || eintrag.name.toLowerCase().includes(gesucht),
    );

    // Genau ein Treffer: Wer sucht, will dorthin — nicht auf eine Liste mit
    // einem Eintrag. Das ist der Ersatz fuer „Enter springt hin" ohne JavaScript.
    if (treffer.length === 1 && begriff !== '') {
      return res.redirect(302, treffer[0].pfad);
    }

    return res.type('html').send(
      String(
        seite({
          titel: 'Seite suchen',
          pfad: '/suche',
          stufe: req.stufe,
          sitzung: req.sitzung,
          botStatus: bot.status(),
          inhalt: html`
            <h1>Seite suchen</h1>
            <form method="get" action="/suche" role="search" class="suchformular">
              <label for="suchbegriff">Suchbegriff</label>
              <input type="search" id="suchbegriff" name="q" value="${begriff}" autofocus>
              <button type="submit">Suchen</button>
            </form>
            ${treffer.length === 0
              ? html`<p>Zu „${begriff}" wurde nichts gefunden. Es gibt keine Seite dieses Namens,
                     oder sie ist für deine Zugriffsstufe nicht freigegeben.</p>`
              : html`
                  <ul class="trefferliste">
                    ${treffer.map(
                      (eintrag) => html`
                        <li>
                          <a href="${eintrag.pfad}">${eintrag.name}</a>
                          <span class="treffer-gruppe">${eintrag.gruppe}</span>
                        </li>
                      `,
                    )}
                  </ul>
                `}
          `,
        }),
      ),
    );
  });
}
