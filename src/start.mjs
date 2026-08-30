import { leseKonfig, KonfigFehler } from './kern/konfig.mjs';
import { erstelleLogger } from './kern/logger.mjs';
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

erstelleApp().listen(konfig.port, () => {
  logger.info('start', 'Panel läuft', {
    adresse: konfig.panelUrl,
    port: konfig.port,
    sicheresCookie: konfig.sicheresCookie,
  });
});
