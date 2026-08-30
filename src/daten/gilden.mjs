import { jetzt } from './repository.mjs';

/** Die Server, die das Panel kennt. Heute einer, das Modell erlaubt mehrere. */
export function erstelleGilden(db) {
  const merken = db.prepare(`
    INSERT INTO gilden (guild_id, name, hinzugefuegt_am) VALUES (?, ?, ?)
    ON CONFLICT (guild_id) DO UPDATE SET name = excluded.name
  `);
  const finden = db.prepare('SELECT guild_id, name, hinzugefuegt_am FROM gilden WHERE guild_id = ?');
  const alleLesen = db.prepare('SELECT guild_id, name, hinzugefuegt_am FROM gilden ORDER BY name');
  const vergessen = db.prepare('DELETE FROM gilden WHERE guild_id = ?');

  const abbilden = (zeile) =>
    zeile && { guildId: zeile.guild_id, name: zeile.name, hinzugefuegtAm: zeile.hinzugefuegt_am };

  return {
    merke(guildId, name) {
      merken.run(guildId, name ?? null, jetzt());
    },
    finde(guildId) {
      return abbilden(finden.get(guildId));
    },
    alle() {
      return alleLesen.all().map(abbilden);
    },
    vergiss(guildId) {
      vergessen.run(guildId);
    },
  };
}
