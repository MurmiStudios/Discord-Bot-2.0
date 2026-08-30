import { erstelleApp } from '../../src/web/server.mjs';

/**
 * Startet die App auf einem freien Port, ruft `fn` mit der Basis-Adresse auf
 * und faehrt den Server danach in jedem Fall wieder herunter.
 */
export async function mitServer(fn) {
  const server = erstelleApp().listen(0, '127.0.0.1');
  await new Promise((fertig, fehler) => {
    server.once('listening', fertig);
    server.once('error', fehler);
  });
  const basis = `http://127.0.0.1:${server.address().port}`;
  try {
    return await fn(basis);
  } finally {
    await new Promise((fertig) => server.close(fertig));
  }
}
