const AUTORISIEREN = 'https://discord.com/oauth2/authorize';
const API = 'https://discord.com/api/v10';

/** Discord hat den Ablauf abgelehnt — nicht unser Fehler, aber unsere Meldung. */
export class OauthFehler extends Error {
  constructor(meldung, ursache) {
    super(meldung);
    this.name = 'OauthFehler';
    this.ursache = ursache;
  }
}

/**
 * Der OAuth2-Ablauf gegen Discord.
 *
 * Angefragt wird ausschliesslich `identify` — also wer sich anmeldet. Welche
 * Rollen diese Person auf dem Server hat, holt das Panel spaeter aus dem
 * Guild-Cache des Bots: Das ist immer aktuell und braucht keine zusaetzliche
 * Berechtigung vom anmeldenden Konto.
 */
export function erstelleOauth({ konfig, holen = fetch }) {
  return {
    anmeldeUrl(state) {
      const werte = new URLSearchParams({
        client_id: konfig.clientId,
        redirect_uri: konfig.redirectUri,
        response_type: 'code',
        scope: 'identify',
        state,
      });
      return `${AUTORISIEREN}?${werte}`;
    },

    async tauscheCode(code) {
      const antwort = await holen(`${API}/oauth2/token`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: konfig.clientId,
          client_secret: konfig.clientSecret,
          grant_type: 'authorization_code',
          code,
          redirect_uri: konfig.redirectUri,
        }).toString(),
      });

      if (!antwort.ok) {
        throw new OauthFehler(
          'Discord hat den Anmeldecode nicht angenommen. Meist stimmt die Rückkehradresse ' +
            'im Entwicklerportal nicht mit PANEL_URL überein.',
          antwort.status,
        );
      }

      const koerper = await antwort.json();
      return { zugriffsToken: koerper.access_token };
    },

    async holeNutzer(zugriffsToken) {
      const antwort = await holen(`${API}/users/@me`, {
        headers: { authorization: `Bearer ${zugriffsToken}` },
      });

      if (!antwort.ok) {
        throw new OauthFehler('Discord hat die Kontodaten nicht herausgegeben.', antwort.status);
      }

      const koerper = await antwort.json();
      return {
        discordUserId: koerper.id,
        anzeigename: koerper.global_name || koerper.username,
        avatar: koerper.avatar ?? null,
      };
    },
  };
}
