import { randomBytes } from 'node:crypto';
import { COOKIE_NAME, gleichSicher } from '../../auth/sitzung.mjs';
import { OauthFehler } from '../../auth/oauth.mjs';
import { liesCookies } from '../mw/cookies.mjs';
import { oeffentlich } from '../mw/verlangt.mjs';

const STATE_COOKIE = 'panel_state';
const STATE_LEBENSDAUER_MS = 10 * 60 * 1000;

/** Vorlaeufige Seiten. Schritt 15 ersetzt sie durch das richtige Layout. */
function seite(titel, inhalt) {
  return (
    '<!doctype html>\n<html lang="de">\n<head><meta charset="utf-8">' +
    `<title>${titel} · Discord-Panel</title></head>\n<body>\n${inhalt}\n</body>\n</html>\n`
  );
}

export function registriereAnmeldung(app, { konfig, sitzungen, oauth, logger }) {
  const stateOptionen = {
    httpOnly: true,
    sameSite: 'lax',
    secure: konfig.sicheresCookie,
    path: '/',
    maxAge: STATE_LEBENSDAUER_MS,
  };

  app.get('/login', oeffentlich(), (_req, res) => {
    res.type('html').send(
      seite(
        'Anmelden',
        '<h1>Discord-Panel</h1>\n' +
          '<p>Es gibt kein eigenes Passwort. Melde dich mit deinem Discord-Konto an;\n' +
          'was du danach siehst, entscheidet deine Mitgliedschaft auf dem Server.</p>\n' +
          '<p><a href="/auth/start">Mit Discord anmelden</a></p>',
      ),
    );
  });

  app.get('/auth/start', oeffentlich(), (_req, res) => {
    // Der Zufallswert liegt im Cookie und in der Adresse. Nur wenn beide
    // uebereinstimmen, stammt der Rueckweg wirklich von unserem Start.
    const state = randomBytes(24).toString('base64url');
    res.cookie(STATE_COOKIE, state, stateOptionen);
    res.redirect(302, oauth.anmeldeUrl(state));
  });

  app.get('/auth/callback', oeffentlich(), async (req, res) => {
    const cookies = liesCookies(req);
    res.clearCookie(STATE_COOKIE, { path: '/' });

    if (req.query.error) {
      logger.info('anmeldung', 'Von Discord abgebrochen', { grund: String(req.query.error) });
      return res
        .status(400)
        .type('html')
        .send(
          seite(
            'Anmeldung abgebrochen',
            '<h1>Anmeldung abgebrochen</h1>\n' +
              '<p>Discord hat die Anmeldung abgebrochen. Wenn das nicht gewollt war,\n' +
              'versuche es noch einmal.</p>\n<p><a href="/login">Zurück zur Anmeldung</a></p>',
          ),
        );
    }

    const erwartet = cookies[STATE_COOKIE];
    const bekommen = typeof req.query.state === 'string' ? req.query.state : '';
    if (!erwartet || !gleichSicher(erwartet, bekommen)) {
      logger.warn('anmeldung', 'Rückweg mit falschem oder fehlendem Zufallswert abgewiesen');
      return res
        .status(403)
        .type('html')
        .send(
          seite(
            'Abgewiesen',
            '<h1>Anmeldung abgewiesen</h1>\n' +
              '<p>Dieser Rückweg von Discord gehört nicht zu einer Anmeldung, die hier\n' +
              'begonnen wurde. Fang bitte neu an.</p>\n' +
              '<p><a href="/login">Zurück zur Anmeldung</a></p>',
          ),
        );
    }

    const code = typeof req.query.code === 'string' ? req.query.code : '';
    let nutzer;
    try {
      const { zugriffsToken } = await oauth.tauscheCode(code);
      nutzer = await oauth.holeNutzer(zugriffsToken);
    } catch (fehler) {
      if (!(fehler instanceof OauthFehler)) throw fehler;
      logger.warn('anmeldung', 'Discord hat den Ablauf abgelehnt', { meldung: fehler.message });
      return res
        .status(502)
        .type('html')
        .send(
          seite(
            'Discord antwortet nicht wie erwartet',
            `<h1>Discord antwortet nicht wie erwartet</h1>\n<p>${fehler.message}</p>\n` +
              '<p><a href="/login">Noch einmal versuchen</a></p>',
          ),
        );
    }

    // Eine mitgebrachte Kennung wird nicht weiterbenutzt: sonst koennte jemand
    // dem Browser vorher eine eigene unterschieben und die Sitzung mitlesen.
    const alte = cookies[COOKIE_NAME];
    if (alte) sitzungen.loesche(alte);

    const { kennung } = sitzungen.lege_an(konfig.guildId, nutzer);
    res.cookie(COOKIE_NAME, kennung, sitzungen.cookieOptionen(konfig));
    logger.info('anmeldung', 'Angemeldet', { nutzer: nutzer.anzeigename, id: nutzer.discordUserId });
    return res.redirect(302, '/');
  });

  app.post('/logout', oeffentlich(), (req, res) => {
    const kennung = liesCookies(req)[COOKIE_NAME];
    if (kennung) sitzungen.loesche(kennung);
    res.clearCookie(COOKIE_NAME, { path: '/' });
    res.redirect(302, '/login');
  });
}

/** Haengt die Sitzung an die Anfrage, wenn es eine gibt. */
export function sitzungsMiddleware(sitzungen) {
  return (req, _res, next) => {
    const kennung = liesCookies(req)[COOKIE_NAME];
    req.sitzung = kennung ? sitzungen.lies(kennung) : undefined;
    next();
  };
}
