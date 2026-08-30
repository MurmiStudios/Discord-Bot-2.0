import { erstelleApp } from './web/server.mjs';

const port = Number(process.env.PORT ?? 3000);

erstelleApp().listen(port, () => {
  console.log(`Panel läuft auf http://localhost:${port}`);
});
