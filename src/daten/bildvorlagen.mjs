import { verlangtGildenId, jetzt } from './repository.mjs';
import { standardVorlage } from '../bilder/renderer.mjs';

/**
 * Ablage für Bildvorlagen.
 *
 * Eine Vorlage besteht aus einem Namen und den Einstellungen des Renderers.
 * Die Einstellungen gehen als JSON in eine Spalte — siehe die Migration, warum.
 *
 * Beim Lesen wird bewusst nicht darauf vertraut, dass in der Spalte gültiges
 * JSON steht. Eine beschädigte Zeile darf die Liste nicht unbrauchbar machen;
 * sie wird stattdessen als beschädigt gekennzeichnet, damit die Seite es sagen
 * kann, statt es zu verschweigen.
 */
export function erstelleBildvorlagen(db) {
  const anlegen = db.prepare(`
    INSERT INTO bildvorlagen (guild_id, name, daten, erstellt_am, geaendert_am)
    VALUES (?, ?, ?, ?, ?)
  `);
  const aendern = db.prepare(
    'UPDATE bildvorlagen SET name = ?, daten = ?, geaendert_am = ? WHERE id = ? AND guild_id = ?',
  );
  const loeschen = db.prepare('DELETE FROM bildvorlagen WHERE id = ? AND guild_id = ?');
  const einzeln = db.prepare('SELECT * FROM bildvorlagen WHERE id = ? AND guild_id = ?');
  const liste = db.prepare(
    'SELECT * FROM bildvorlagen WHERE guild_id = ? ORDER BY name COLLATE NOCASE, id',
  );

  const alsEintrag = (z) => {
    if (!z) return undefined;

    let vorlage;
    let beschaedigt = false;
    try {
      vorlage = { ...standardVorlage(), ...JSON.parse(z.daten) };
    } catch {
      vorlage = standardVorlage();
      beschaedigt = true;
    }

    return {
      id: z.id,
      name: z.name,
      vorlage,
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
    lege(guildId, { name, vorlage }) {
      const zeit = jetzt();
      const ergebnis = anlegen.run(
        verlangtGildenId(guildId), name, JSON.stringify(vorlage), zeit, zeit,
      );
      return Number(ergebnis.lastInsertRowid);
    },

    /** @returns {boolean} ob es die Vorlage auf diesem Server gab */
    aendere(guildId, id, { name, vorlage }) {
      return (
        aendern.run(name, JSON.stringify(vorlage), jetzt(), id, verlangtGildenId(guildId))
          .changes > 0
      );
    },

    /** @returns {boolean} ob etwas gelöscht wurde */
    loesche(guildId, id) {
      return loeschen.run(id, verlangtGildenId(guildId)).changes > 0;
    },
  };
}
