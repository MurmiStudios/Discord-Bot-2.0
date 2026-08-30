import { verlangtGildenId } from './repository.mjs';
import { hoehere } from '../kern/stufen.mjs';

/**
 * Zuordnung Discord-Rolle → Zugriffsstufe im Panel.
 *
 * Bewusst nur die Zuordnung: welche Stufe jemand tatsaechlich hat, entscheidet
 * `src/auth/rechte.mjs` bei jeder Anfrage neu aus den aktuellen Rollen. Hier
 * liegt nichts, was veralten koennte.
 */
export function erstelleZugriff(db) {
  const setzen = db.prepare(`
    INSERT INTO zugriff (guild_id, rollen_id, stufe) VALUES (?, ?, ?)
    ON CONFLICT (guild_id, rollen_id) DO UPDATE SET stufe = excluded.stufe
  `);
  const alleLesen = db.prepare(
    'SELECT rollen_id, stufe FROM zugriff WHERE guild_id = ? ORDER BY rollen_id',
  );
  const entfernen = db.prepare('DELETE FROM zugriff WHERE guild_id = ? AND rollen_id = ?');

  const abbilden = (zeile) => ({ rollenId: zeile.rollen_id, stufe: zeile.stufe });

  return {
    setze(guildId, rollenId, stufe) {
      setzen.run(verlangtGildenId(guildId), rollenId, stufe);
    },
    alle(guildId) {
      return alleLesen.all(verlangtGildenId(guildId)).map(abbilden);
    },
    entferne(guildId, rollenId) {
      entfernen.run(verlangtGildenId(guildId), rollenId);
    },
    /**
     * Hoechste Stufe, die sich aus den uebergebenen Rollen ergibt.
     * @returns {string|undefined} undefined, wenn keine Rolle zugeordnet ist
     */
    stufeFuerRollen(guildId, rollenIds) {
      const zugeordnet = new Map(
        alleLesen.all(verlangtGildenId(guildId)).map((z) => [z.rollen_id, z.stufe]),
      );
      let beste;
      for (const rollenId of rollenIds) {
        const stufe = zugeordnet.get(rollenId);
        if (stufe) beste = hoehere(beste, stufe);
      }
      return beste;
    },
  };
}
