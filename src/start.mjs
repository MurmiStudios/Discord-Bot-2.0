import { leseKonfig, KonfigFehler } from './kern/konfig.mjs';
import { erstelleLogger } from './kern/logger.mjs';
import { oeffneDatenbank } from './daten/db.mjs';
import { migriere, ladeMigrationen } from './daten/migrieren.mjs';
import { erstelleGilden } from './daten/gilden.mjs';
import { erstelleSitzungen } from './auth/sitzung.mjs';
import { erstelleOauth } from './auth/oauth.mjs';
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

erstelleApp({ konfig, db, gilden, sitzungen, oauth, logger }).listen(konfig.port, () => {
  logger.info('start', 'Panel läuft', {
    adresse: konfig.panelUrl,
    port: konfig.port,
    sicheresCookie: konfig.sicheresCookie,
  });
});
