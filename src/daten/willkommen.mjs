import { verlangtGildenId, jetzt } from './repository.mjs';

/**
 * Die Willkommensnachricht — genau eine je Server.
 *
 * `lies` gibt auch dann etwas zurück, wenn noch nie etwas gespeichert wurde:
 * eine leere, inaktive Nachricht. Damit muss keine aufrufende Stelle den Fall
 * „gibt es noch nicht“ von „ist leer“ unterscheiden — es ist derselbe.
 */
export function erstelleWillkommen(db) {
  const lesen = db.prepare('SELECT * FROM willkommen WHERE guild_id = ?');
  const schreiben = db.prepare(`
    INSERT INTO willkommen (guild_id, aktiv, daten, geaendert_am)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(guild_id) DO UPDATE SET aktiv = excluded.aktiv,
                                        daten = excluded.daten,
                                        geaendert_am = excluded.geaendert_am
  `);

  return {
    /** @returns {{aktiv: boolean, daten: object, beschaedigt: boolean, geaendertAm: ?string}} */
    lies(guildId) {
      const zeile = lesen.get(verlangtGildenId(guildId));
      if (!zeile) return { aktiv: false, daten: {}, beschaedigt: false, geaendertAm: null };

      try {
        return {
          aktiv: zeile.aktiv === 1,
          daten: JSON.parse(zeile.daten),
          beschaedigt: false,
          geaendertAm: zeile.geaendert_am,
        };
      } catch {
        // Sicherheitshalber inaktiv: Was nicht lesbar ist, soll nicht raus.
        return { aktiv: false, daten: {}, beschaedigt: true, geaendertAm: zeile.geaendert_am };
      }
    },

    sichere(guildId, { aktiv, daten }) {
      schreiben.run(verlangtGildenId(guildId), aktiv ? 1 : 0, JSON.stringify(daten), jetzt());
    },
  };
}
