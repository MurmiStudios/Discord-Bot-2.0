/**
 * Holt das Profilbild einer Person, damit es im Bild landen kann.
 *
 * Drei Dinge, die hier bewusst so sind:
 *
 * - Geladen wird nur von Discords eigenem Bildserver. Die Adresse kommt zwar
 *   aus dem Guild-Cache und ist damit vertrauenswürdig — aber eine Prüfung
 *   kostet eine Zeile und nimmt dem Panel die Möglichkeit, je als Umweg für
 *   fremde Abrufe zu dienen.
 * - Ein Fehlschlag gibt `null` zurück und wirft nicht. Ohne Profilbild ist das
 *   Bild unvollständig; ohne Bild wäre die ganze Nachricht weg.
 * - Ein kleiner Zwischenspeicher, weil die Vorschau beim Tippen mehrmals je
 *   Sekunde rendert. Ohne ihn ginge für jedes Zwischenbild eine Anfrage an
 *   Discord.
 */

const ERLAUBTER_HOST = 'cdn.discordapp.com';
const MAX_BYTES = 2 * 1024 * 1024;
const HALTBAR_MS = 5 * 60 * 1000;
const MERKGRENZE = 50;

export function erstelleAvatarQuelle({ hole = fetch, jetzt = () => Date.now() } = {}) {
  const gemerkt = new Map();

  const ausMerkzettel = (adresse) => {
    const eintrag = gemerkt.get(adresse);
    if (!eintrag) return undefined;

    if (jetzt() - eintrag.zeit > HALTBAR_MS) {
      gemerkt.delete(adresse);
      return undefined;
    }
    return eintrag.puffer;
  };

  const merke = (adresse, puffer) => {
    // Der älteste Eintrag fliegt raus. Reicht: Es geht um Sekunden beim Tippen,
    // nicht um einen Zwischenspeicher mit Anspruch.
    if (gemerkt.size >= MERKGRENZE) gemerkt.delete(gemerkt.keys().next().value);
    gemerkt.set(adresse, { puffer, zeit: jetzt() });
  };

  return {
    /** @returns {Promise<Buffer|null>} das Bild, oder null wenn es nicht geht */
    async fuer(adresse) {
      if (typeof adresse !== 'string' || adresse === '') return null;

      let ziel;
      try {
        ziel = new URL(adresse);
      } catch {
        return null;
      }
      if (ziel.protocol !== 'https:' || ziel.hostname !== ERLAUBTER_HOST) return null;

      const bekannt = ausMerkzettel(ziel.href);
      if (bekannt !== undefined) return bekannt;

      try {
        const antwort = await hole(ziel.href, { signal: AbortSignal.timeout(5000) });
        if (!antwort.ok) return null;

        const puffer = Buffer.from(await antwort.arrayBuffer());
        if (puffer.length === 0 || puffer.length > MAX_BYTES) return null;

        merke(ziel.href, puffer);
        return puffer;
      } catch {
        // Zeitüberschreitung, kein Netz, kaputte Antwort — alles derselbe Fall.
        return null;
      }
    },
  };
}
