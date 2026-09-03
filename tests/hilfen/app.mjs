import { join } from 'node:path';
import { oeffneDatenbank } from '../../src/daten/db.mjs';
import { migriere, ladeMigrationen } from '../../src/daten/migrieren.mjs';
import { erstelleGilden } from '../../src/daten/gilden.mjs';
import { erstelleZugriff } from '../../src/daten/zugriff.mjs';
import { erstelleSitzungen } from '../../src/auth/sitzung.mjs';
import { erstelleOauth } from '../../src/auth/oauth.mjs';
import { erstelleLogger } from '../../src/kern/logger.mjs';
import { erstelleApp } from '../../src/web/server.mjs';
import { mitTempVerzeichnis } from './db.mjs';
import { erstelleDiscordDoppel } from './discord-oauth-doppel.mjs';
import { erstelleClientDoppel } from './discord-doppel.mjs';
import { erstelleBot } from '../../src/discord/bot.mjs';
import { erstelleGildenAnsicht } from '../../src/discord/gilde.mjs';
import { erstelleVersandAblage } from '../../src/daten/versand.mjs';
import { erstelleBildvorlagen } from '../../src/daten/bildvorlagen.mjs';
import { erstelleNachrichtenAblage } from '../../src/daten/nachrichten.mjs';
import { erstelleWillkommen } from '../../src/daten/willkommen.mjs';
import { erstelleRollenNachrichten } from '../../src/daten/rollen_nachrichten.mjs';
import { erstelleRollenregeln } from '../../src/daten/rollenregeln.mjs';
import { erstelleAktionsleisten } from '../../src/daten/aktionsleisten.mjs';
import { erstelleAvatarQuelle } from '../../src/bilder/avatar.mjs';
import { erstelleBildAnhang } from '../../src/versand/anhang.mjs';
import { testBild } from './bild.mjs';
import { erstelleVersender } from '../../src/discord/versender.mjs';
import { erstelleWarteschlange } from '../../src/versand/warteschlange.mjs';
import { erstelleProtokoll } from '../../src/protokoll/protokoll.mjs';

export const GILDE = '111111111111111111';

export const TEST_KONFIG = Object.freeze({
  token: 'MTIzNDU2Nzg5MDEyMzQ1Njc4.GaBcDe.test-token-wert-hier',
  clientId: '123456789012345678',
  clientSecret: 'test-client-secret-lang-genug-fuer-alles',
  guildId: GILDE,
  ownerId: '4242',
  sessionSecret: 'b'.repeat(64),
  panelUrl: 'http://127.0.0.1:3000',
  redirectUri: 'http://127.0.0.1:3000/auth/callback',
  port: 3000,
  dmMaxEmpfaenger: 100,
  dmPauseMs: 1200,
  uploadMaxBytes: 5242880,
  uploadMaxKante: 4096,
  vertraueProxy: false,
  sicheresCookie: false,
});

/**
 * Startet die vollstaendige App auf einem freien Port, mit echter SQLite-Datei
 * im Temp-Verzeichnis und erfundenem Discord.
 */
export async function mitApp(
  fn,
  {
    konfig = {}, discord = {}, rollen, zugriffsregeln = [], discordServer = {},
    botVerbunden = true,
    // Kein Netz im Test: Profilbilder kommen aus einem erfundenen Abruf. Wer
    // den Fehlerfall braucht, gibt eine Funktion mit `ok: false` mit.
    avatarHolen = async () => ({ ok: true, arrayBuffer: async () => testBild('#5865f2', 128) }),
  } = {},
) {
  return mitTempVerzeichnis(async (dir) => {
    const db = oeffneDatenbank(join(dir, 'panel.db'));
    migriere(db, ladeMigrationen(new URL('../../src/daten/migrationen/', import.meta.url).pathname));

    const vollKonfig = { ...TEST_KONFIG, ...konfig };
    const gilden = erstelleGilden(db);
    gilden.merke(vollKonfig.guildId, 'Testserver');

    const doppel = erstelleDiscordDoppel(discord);
    const zeilen = [];
    const logger = erstelleLogger({
      geheimnisse: [vollKonfig.token, vollKonfig.clientSecret, vollKonfig.sessionSecret],
      schreibe: (zeile) => zeilen.push(zeile),
    });
    const sitzungen = erstelleSitzungen(db, { sessionSecret: vollKonfig.sessionSecret });
    const oauth = erstelleOauth({ konfig: vollKonfig, holen: doppel.holen });

    const zugriff = erstelleZugriff(db);
    for (const [rollenId, stufe] of zugriffsregeln) zugriff.setze(vollKonfig.guildId, rollenId, stufe);

    // Echter Guild-Cache auf einem erfundenen Server.
    const doppelServer = erstelleClientDoppel({ guildId: vollKonfig.guildId, ...discordServer });
    const { client } = doppelServer;
    const bot = erstelleBot({ konfig: vollKonfig, logger, erzeugeClient: () => client });
    if (botVerbunden) {
      await bot.verbinde();
      await new Promise((f) => setTimeout(f, 0));
    }
    const gildenAnsicht = erstelleGildenAnsicht({ bot, konfig: vollKonfig });

    // `rollen` erlaubt es einem Test, die Mitgliedschaft direkt vorzugeben,
    // ohne den ganzen Server zu beschreiben. Ohne die Angabe entscheidet der
    // Guild-Cache — so wie im Betrieb.
    const mitgliedschaft =
      rollen === undefined ? gildenAnsicht : { rollenVon: (_guildId, userId) => rollen[userId] };

    const versandAblage = erstelleVersandAblage(db);
    const bildvorlagen = erstelleBildvorlagen(db);
    const nachrichtenAblage = erstelleNachrichtenAblage(db);
    const willkommen = erstelleWillkommen(db);
    const rollenNachrichten = erstelleRollenNachrichten(db);
    const rollenregeln = erstelleRollenregeln(db);
    const aktionsleisten = erstelleAktionsleisten(db);
    const bilderVerzeichnis = join(dir, 'bilder');
    const avatarQuelle = erstelleAvatarQuelle({ hole: avatarHolen });
    const versender = erstelleVersender({
      bot, konfig: vollKonfig, gildenAnsicht,
      anhangBauer: erstelleBildAnhang({
        bildvorlagen, gildenAnsicht, avatarQuelle, konfig: vollKonfig, bilderVerzeichnis,
      }),
    });
    const warteschlange = erstelleWarteschlange({
      ablage: versandAblage,
      senden: (empfaenger, nachricht) => versender.sendeDm(empfaenger, nachricht),
      protokoll: erstelleProtokoll(db),
      logger,
      konfig: vollKonfig,
      // Im Test wird nicht wirklich gewartet — sonst dauerte jeder Versandtest
      // so lange wie im Betrieb.
      warte: async () => {},
    });

    const app = erstelleApp({
      konfig: vollKonfig, db, gilden, sitzungen, oauth, logger, zugriff,
      mitgliedschaft, bot, gildenAnsicht, warteschlange, versandAblage, versender,
      bildvorlagen, bilderVerzeichnis, avatarQuelle, nachrichtenAblage, willkommen, rollenNachrichten, rollenregeln, aktionsleisten,
    });
    const server = app.listen(0, '127.0.0.1');
    await new Promise((fertig, fehler) => {
      server.once('listening', fertig);
      server.once('error', fehler);
    });
    const basis = `http://127.0.0.1:${server.address().port}`;

    try {
      return await fn({
        app, basis, db, gilden, sitzungen, zugriff, konfig: vollKonfig, doppel,
        logzeilen: zeilen, bot, gildenAnsicht, doppelServer, versandAblage,
        bildvorlagen, bilderVerzeichnis, nachrichtenAblage, willkommen, rollenNachrichten, rollenregeln, aktionsleisten,
        warteAufVersand: () => warteschlange.letzterLauf(),
      });
    } finally {
      await new Promise((fertig) => server.close(fertig));
      db.close();
    }
  });
}

/** Liest einen gesetzten Cookie-Wert aus den Set-Cookie-Koepfen einer Antwort. */
export function cookieAus(antwort, name) {
  for (const kopf of antwort.headers.getSetCookie?.() ?? []) {
    const [paar] = kopf.split(';');
    const trenner = paar.indexOf('=');
    if (paar.slice(0, trenner) === name) return decodeURIComponent(paar.slice(trenner + 1));
  }
  return undefined;
}

/** Liest die Zusaetze (Secure, HttpOnly, ...) eines gesetzten Cookies. */
export function cookieZusaetze(antwort, name) {
  for (const kopf of antwort.headers.getSetCookie?.() ?? []) {
    if (kopf.startsWith(`${name}=`)) return kopf;
  }
  return undefined;
}
