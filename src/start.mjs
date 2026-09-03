import { leseKonfig, KonfigFehler } from './kern/konfig.mjs';
import { erstelleLogger } from './kern/logger.mjs';
import { oeffneDatenbank } from './daten/db.mjs';
import { migriere, ladeMigrationen } from './daten/migrieren.mjs';
import { erstelleGilden } from './daten/gilden.mjs';
import { erstelleZugriff } from './daten/zugriff.mjs';
import { erstelleSitzungen } from './auth/sitzung.mjs';
import { erstelleOauth } from './auth/oauth.mjs';
import { erstelleBot } from './discord/bot.mjs';
import { erstelleGildenAnsicht } from './discord/gilde.mjs';
import { erstelleVersandAblage } from './daten/versand.mjs';
import { erstelleBildvorlagen } from './daten/bildvorlagen.mjs';
import { erstelleNachrichtenAblage } from './daten/nachrichten.mjs';
import { erstelleWillkommen } from './daten/willkommen.mjs';
import { erstelleRollenNachrichten } from './daten/rollen_nachrichten.mjs';
import { erstelleWillkommensAutomatik } from './automatik/willkommen.mjs';
import { erstelleRollenAutomatik } from './automatik/rollen-nachricht.mjs';
import { registriereEreignisse } from './discord/ereignisse.mjs';
import { erstelleVersender } from './discord/versender.mjs';
import { erstelleBildAnhang } from './versand/anhang.mjs';
import { erstelleAvatarQuelle } from './bilder/avatar.mjs';
import { erstelleWarteschlange } from './versand/warteschlange.mjs';
import { erstelleProtokoll } from './protokoll/protokoll.mjs';
import { erstelleRouter } from './discord/interaktion/router.mjs';
import { ladeBefehle, registriereBefehle } from './discord/interaktion/registrieren.mjs';
import { erstelleApp } from './web/server.mjs';

let konfig;
try {
  konfig = leseKonfig();
} catch (fehler) {
  if (fehler instanceof KonfigFehler) {
    // Vor dem Logger, weil es den ohne gueltige Konfiguration noch nicht gibt.
    console.error(`\n${fehler.message}\n`);
    process.exit(1);
  }
  throw fehler;
}

const logger = erstelleLogger({
  geheimnisse: [konfig.token, konfig.clientSecret, konfig.sessionSecret],
});

const db = oeffneDatenbank(new URL('../speicher/panel.db', import.meta.url).pathname);
const angewendet = migriere(db, ladeMigrationen(new URL('./daten/migrationen/', import.meta.url).pathname));
if (angewendet > 0) logger.info('daten', 'Migrationen angewendet', { anzahl: angewendet });

const gilden = erstelleGilden(db);
gilden.merke(konfig.guildId, null);

const sitzungen = erstelleSitzungen(db, { sessionSecret: konfig.sessionSecret });
const oauth = erstelleOauth({ konfig });
const zugriff = erstelleZugriff(db);

const bot = erstelleBot({ konfig, logger });
const gildenAnsicht = erstelleGildenAnsicht({ bot, konfig });

// Drei Spuren fuer alles, was aus Discord zurueckkommt. `befehle/` ist heute
// leer — der Weg dorthin existiert trotzdem, damit ein spaeterer Slash-Befehl
// eine Datei ist und kein Umbau.
const befehle = await ladeBefehle(new URL('./discord/interaktion/befehle/', import.meta.url));
const router = erstelleRouter({ logger, buttons: new Map(), modals: new Map(), befehle });
router.registriereAn(bot.client);

// Der Webserver startet unabhaengig davon, ob Discord erreichbar ist. Faellt
// die Verbindung aus, bleibt das Panel bedienbar und sagt es in der Kopfzeile.
bot.verbinde();
registriereBefehle({ befehle, konfig, logger });

const protokoll = erstelleProtokoll(db, {
  geheimnisse: [konfig.token, konfig.clientSecret, konfig.sessionSecret],
});
const versandAblage = erstelleVersandAblage(db);
const bildvorlagen = erstelleBildvorlagen(db);
const nachrichtenAblage = erstelleNachrichtenAblage(db);
const willkommen = erstelleWillkommen(db);
const rollenNachrichten = erstelleRollenNachrichten(db);
// Hochgeladene Hintergrundbilder liegen neben der Datenbank — beides gehoert
// zum Bestand, den eine Sicherung mitnehmen muss.
const bilderVerzeichnis = new URL('../speicher/bilder/', import.meta.url).pathname;
const avatarQuelle = erstelleAvatarQuelle();
const versender = erstelleVersender({
  bot, konfig, gildenAnsicht,
  anhangBauer: erstelleBildAnhang({
    bildvorlagen, gildenAnsicht, avatarQuelle, konfig, bilderVerzeichnis,
  }),
});
const warteschlange = erstelleWarteschlange({
  ablage: versandAblage,
  senden: (empfaenger, nachricht) => versender.sendeDm(empfaenger, nachricht),
  protokoll,
  logger,
  konfig,
});

// Ein Vorgang, der nach einem Neustart noch „laeuft“, kann es nicht — der
// Prozess, der ihn betrieb, ist weg.
warteschlange.brichLaufendeAb(konfig.guildId);

// Die Automatiken. Sie haengen am Client und nicht am Webserver: Sie laufen
// auch dann, wenn niemand das Panel offen hat — das ist ihr ganzer Zweck.
const willkommensAutomatik = erstelleWillkommensAutomatik({
  willkommen, versender, protokoll, logger, konfig,
});
const rollenAutomatik = erstelleRollenAutomatik({
  rollenNachrichten, gildenAnsicht, versender, protokoll, logger, konfig,
});
registriereEreignisse(bot.client, {
  konfig, logger,
  beiBeitritt: (mitglied) => willkommensAutomatik.beiBeitritt(mitglied),
  beiRollenerhalt: (mitglied, rollen) => rollenAutomatik.beiRollenerhalt(mitglied, rollen),
});

erstelleApp({
  konfig, db, gilden, sitzungen, oauth, logger, zugriff,
  bot, gildenAnsicht, mitgliedschaft: gildenAnsicht,
  warteschlange, versandAblage, versender, bildvorlagen, bilderVerzeichnis, avatarQuelle,
  nachrichtenAblage, willkommen, rollenNachrichten,
})
  .listen(konfig.port, () => {
    logger.info('start', 'Panel läuft', {
      adresse: konfig.panelUrl,
      port: konfig.port,
      sicheresCookie: konfig.sicheresCookie,
    });
  });
