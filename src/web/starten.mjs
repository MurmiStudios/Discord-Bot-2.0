/**
 * Das Panel an den Port hängen — und den einen Fehler abfangen, der beim
 * Selbsthosten wirklich vorkommt.
 *
 * Ohne einen Zuhörer auf `error` wirft Node einen Stapelabzug in die Konsole,
 * und der sagt „EADDRINUSE" statt „da läuft schon einer". Schlimmer noch: Der
 * Bot meldet sich vor dem Port bei Discord an. Ein zweiter Prozess ist also
 * schon am Gateway, bevor er am Port scheitert — und schickt in dem Moment
 * jede Direktnachricht ein zweites Mal. Genau darum wird der Bot hier beendet
 * und nicht nur die Meldung ausgegeben.
 */
export function starte(app, { konfig, logger, bot, beende = (code) => process.exit(code) }) {
  const server = app.listen(konfig.port, () => {
    logger.info('start', 'Panel läuft', {
      adresse: konfig.panelUrl,
      port: konfig.port,
      sicheresCookie: konfig.sicheresCookie,
    });
  });

  server.on('error', async (fehler) => {
    const belegt = fehler?.code === 'EADDRINUSE';

    logger.fehler('start', belegt
      ? `Port ${konfig.port} ist belegt — vermutlich läuft das Panel schon. `
        + 'Beende den anderen Start (ps aux | grep "[n]ode src/start.mjs"), oder setze PORT '
        + 'in der .env auf einen freien Port. Dieser Start wird abgebrochen, damit nicht '
        + 'zwei Bots dieselben Nachrichten verschicken.'
      : 'Das Panel konnte den Port nicht belegen.', fehler);

    // Erst vom Gateway trennen, dann gehen: Solange der Client hängt, sieht
    // dieser Prozess jedes Ereignis und beantwortet es.
    try {
      await bot?.beende?.();
    } catch (abbruch) {
      logger.fehler('start', 'Der Bot liess sich nicht sauber beenden', abbruch);
    }
    beende(1);
  });

  return server;
}
