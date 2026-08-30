import { leseKonfig, KonfigFehler } from './kern/konfig.mjs';
import { erstelleApp } from './web/server.mjs';

let konfig;
try {
  konfig = leseKonfig();
} catch (fehler) {
  if (fehler instanceof KonfigFehler) {
    console.error(`\n${fehler.message}\n`);
    process.exit(1);
  }
  throw fehler;
}

erstelleApp().listen(konfig.port, () => {
  console.log(`Panel läuft auf ${konfig.panelUrl}`);
});
