import { verlangtGildenId, jetzt } from './repository.mjs';

/**
 * Regeln der Form „Wer X erhält, verliert Y“.
 *
 * Eine Regel je Auslöserrolle, gesichert durch den UNIQUE-Index. Speichern
 * ersetzt deshalb, statt eine zweite anzulegen.
 */
export function erstelleRollenregeln(db) {
  const schreiben = db.prepare(`
    INSERT INTO rollenregeln (guild_id, ausloeser, entzug, aktiv, notiz, geaendert_am)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(guild_id, ausloeser) DO UPDATE SET entzug = excluded.entzug,
                                                   aktiv = excluded.aktiv,
                                                   notiz = excluded.notiz,
                                                   geaendert_am = excluded.geaendert_am
  `);
  const einzeln = db.prepare('SELECT * FROM rollenregeln WHERE guild_id = ? AND ausloeser = ?');
  const alleLesen = db.prepare('SELECT * FROM rollenregeln WHERE guild_id = ? ORDER BY id');
  const loeschen = db.prepare('DELETE FROM rollenregeln WHERE guild_id = ? AND ausloeser = ?');

  const alsRegel = (z) => {
    if (!z) return undefined;

    let entzug = [];
    let beschaedigt = false;
    try {
      const gelesen = JSON.parse(z.entzug);
      entzug = Array.isArray(gelesen) ? gelesen.map(String) : [];
    } catch {
      beschaedigt = true;
    }

    return {
      ausloeser: z.ausloeser,
      entzug,
      // Was nicht lesbar ist, wird nicht angewendet.
      aktiv: z.aktiv === 1 && !beschaedigt,
      notiz: z.notiz ?? '',
      beschaedigt,
      geaendertAm: z.geaendert_am,
    };
  };

  return {
    alle(guildId) {
      return alleLesen.all(verlangtGildenId(guildId)).map(alsRegel);
    },

    fuerAusloeser(guildId, ausloeser) {
      return alsRegel(einzeln.get(verlangtGildenId(guildId), String(ausloeser)));
    },

    sichere(guildId, ausloeser, { entzug, aktiv, notiz = '' }) {
      schreiben.run(
        verlangtGildenId(guildId), String(ausloeser),
        JSON.stringify([...new Set((entzug ?? []).map(String))]),
        aktiv ? 1 : 0, notiz, jetzt(),
      );
    },

    /** @returns {boolean} ob es etwas zu löschen gab */
    loesche(guildId, ausloeser) {
      return loeschen.run(verlangtGildenId(guildId), String(ausloeser)).changes > 0;
    },
  };
}
