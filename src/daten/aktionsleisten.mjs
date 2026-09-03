import { verlangtGildenId, jetzt } from './repository.mjs';

/**
 * Ablage für Aktionsleisten.
 *
 * Wie bei den Bildvorlagen: Der Inhalt geht als JSON hinein, eine beschädigte
 * Zeile macht die Liste nicht unbrauchbar, sondern wird gekennzeichnet.
 */
export function erstelleAktionsleisten(db) {
  const anlegen = db.prepare(`
    INSERT INTO aktionsleisten (guild_id, name, daten, erstellt_am, geaendert_am)
    VALUES (?, ?, ?, ?, ?)
  `);
  const aendern = db.prepare(
    'UPDATE aktionsleisten SET name = ?, daten = ?, geaendert_am = ? WHERE id = ? AND guild_id = ?',
  );
  const loeschen = db.prepare('DELETE FROM aktionsleisten WHERE id = ? AND guild_id = ?');
  const einzeln = db.prepare('SELECT * FROM aktionsleisten WHERE id = ? AND guild_id = ?');
  const liste = db.prepare(
    'SELECT * FROM aktionsleisten WHERE guild_id = ? ORDER BY name COLLATE NOCASE, id',
  );

  const alsEintrag = (z) => {
    if (!z) return undefined;

    let knoepfe = [];
    let beschaedigt = false;
    try {
      const gelesen = JSON.parse(z.daten);
      knoepfe = Array.isArray(gelesen?.knoepfe) ? gelesen.knoepfe : [];
    } catch {
      beschaedigt = true;
    }

    return {
      id: z.id,
      name: z.name,
      knoepfe,
      beschaedigt,
      erstelltAm: z.erstellt_am,
      geaendertAm: z.geaendert_am,
    };
  };

  return {
    alle(guildId) {
      return liste.all(verlangtGildenId(guildId)).map(alsEintrag);
    },

    lies(guildId, id) {
      return alsEintrag(einzeln.get(id, verlangtGildenId(guildId)));
    },

    /** @returns {number} die vergebene Kennung */
    lege(guildId, { name, knoepfe }) {
      const zeit = jetzt();
      const ergebnis = anlegen.run(
        verlangtGildenId(guildId), name, JSON.stringify({ knoepfe }), zeit, zeit,
      );
      return Number(ergebnis.lastInsertRowid);
    },

    /** @returns {boolean} ob es die Leiste auf diesem Server gab */
    aendere(guildId, id, { name, knoepfe }) {
      return (
        aendern.run(name, JSON.stringify({ knoepfe }), jetzt(), id, verlangtGildenId(guildId))
          .changes > 0
      );
    },

    /** @returns {boolean} ob etwas gelöscht wurde */
    loesche(guildId, id) {
      return loeschen.run(id, verlangtGildenId(guildId)).changes > 0;
    },
  };
}
