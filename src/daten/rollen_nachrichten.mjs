import { verlangtGildenId, jetzt } from './repository.mjs';

/**
 * Nachrichten, die am Erhalt einer Rolle hängen — eine je Rolle.
 *
 * Dass es nur eine je Rolle gibt, sichert der UNIQUE-Index; hier wird deshalb
 * eingefügt oder ersetzt, nie doppelt angelegt. `fuerRolle` gibt auch dann
 * etwas zurück, wenn noch nie etwas gespeichert wurde — eine leere, inaktive
 * Nachricht. So muss keine aufrufende Stelle „gibt es noch nicht“ von „ist
 * leer" unterscheiden.
 */
export function erstelleRollenNachrichten(db) {
  const schreiben = db.prepare(`
    INSERT INTO rollen_nachrichten (guild_id, rollen_id, aktiv, daten, geaendert_am)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(guild_id, rollen_id) DO UPDATE SET aktiv = excluded.aktiv,
                                                   daten = excluded.daten,
                                                   geaendert_am = excluded.geaendert_am
  `);
  const einzeln = db.prepare('SELECT * FROM rollen_nachrichten WHERE guild_id = ? AND rollen_id = ?');
  const alleLesen = db.prepare('SELECT * FROM rollen_nachrichten WHERE guild_id = ? ORDER BY id');
  const loeschen = db.prepare('DELETE FROM rollen_nachrichten WHERE guild_id = ? AND rollen_id = ?');

  const alsEintrag = (z) => {
    if (!z) return undefined;

    try {
      return {
        rollenId: z.rollen_id,
        aktiv: z.aktiv === 1,
        daten: JSON.parse(z.daten),
        beschaedigt: false,
        geaendertAm: z.geaendert_am,
      };
    } catch {
      // Sicherheitshalber inaktiv: Was nicht lesbar ist, soll nicht raus.
      return {
        rollenId: z.rollen_id, aktiv: false, daten: {},
        beschaedigt: true, geaendertAm: z.geaendert_am,
      };
    }
  };

  const leer = (rollenId) => ({
    rollenId, aktiv: false, daten: {}, beschaedigt: false, geaendertAm: null,
  });

  return {
    alle(guildId) {
      return alleLesen.all(verlangtGildenId(guildId)).map(alsEintrag);
    },

    fuerRolle(guildId, rollenId) {
      return alsEintrag(einzeln.get(verlangtGildenId(guildId), String(rollenId))) ?? leer(String(rollenId));
    },

    sichere(guildId, rollenId, { aktiv, daten }) {
      schreiben.run(
        verlangtGildenId(guildId), String(rollenId), aktiv ? 1 : 0, JSON.stringify(daten), jetzt(),
      );
    },

    /** @returns {boolean} ob es etwas zu löschen gab */
    loesche(guildId, rollenId) {
      return loeschen.run(verlangtGildenId(guildId), String(rollenId)).changes > 0;
    },
  };
}
