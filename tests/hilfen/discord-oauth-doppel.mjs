/**
 * Erfundenes Discord fuer den OAuth2-Ablauf. Ersetzt `fetch` und beantwortet
 * genau die zwei Aufrufe, die der Anmeldeablauf macht.
 */
export function erstelleDiscordDoppel({
  code = 'gueltiger-code',
  nutzer = { id: '4242', username: 'anna', global_name: 'Anna', avatar: 'abc' },
  tokenScheitert = false,
  nutzerScheitert = false,
} = {}) {
  const aufrufe = [];

  async function holen(adresse, optionen = {}) {
    const url = new URL(adresse);
    aufrufe.push({ url: url.href, optionen });

    if (url.pathname.endsWith('/oauth2/token')) {
      const gesendet = new URLSearchParams(optionen.body ?? '');
      if (tokenScheitert || gesendet.get('code') !== code) {
        return antwort(400, { error: 'invalid_grant' });
      }
      return antwort(200, { access_token: 'zugriffs-token', token_type: 'Bearer' });
    }

    if (url.pathname.endsWith('/users/@me')) {
      if (nutzerScheitert) return antwort(401, { message: '401: Unauthorized' });
      return antwort(200, nutzer);
    }

    return antwort(404, { message: 'unbekannter Aufruf im Doppel' });
  }

  return { holen, aufrufe };
}

function antwort(status, koerper) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return koerper;
    },
    async text() {
      return JSON.stringify(koerper);
    },
  };
}
