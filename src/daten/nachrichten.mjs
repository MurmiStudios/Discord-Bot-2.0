import { verlangtGildenId, jetzt } from './repository.mjs';

/**
 * Ablage für gespeicherte Nachrichten.
 *
 * Der Inhalt geht als JSON hinein und kommt so wieder heraus, wie ihn
 * `entwurfAus` liest — die beiden sind ein Paar. Dadurch gibt es keine dritte
 * Darstellung einer Nachricht, die man beim nächsten Feld vergessen könnte.
 *
 * Eine beschädigte Zeile macht die Liste nicht unbrauchbar: Sie wird als
 * beschädigt gekennzeichnet, damit die Seite es sagen kann.
 */
export function erstelleNachrichtenAblage(db) {
  const anlegen = db.prepare(`
    INSERT INTO nachrichten (guild_id, name, art, notiz, daten, erstellt_am, geaendert_am)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const aendern = db.prepare(`
    UPDATE nachrichten SET name = ?, art = ?, notiz = ?, daten = ?, geaendert_am = ?
    WHERE id = ? AND guild_id = ?
  `);
  const loeschen = db.prepare('DELETE FROM nachrichten WHERE id = ? AND guild_id = ?');
  const einzeln = db.prepare('SELECT * FROM nachrichten WHERE id = ? AND guild_id = ?');
  const alleLesen = db.prepare(
    'SELECT * FROM nachrichten WHERE guild_id = ? ORDER BY geaendert_am DESC, id DESC',
  );
  const nachArt = db.prepare(
    'SELECT * FROM nachrichten WHERE guild_id = ? AND art = ? ORDER BY geaendert_am DESC, id DESC',
  );
  const zaehlen = db.prepare(
    'SELECT art, COUNT(*) AS anzahl FROM nachrichten WHERE guild_id = ? GROUP BY art',
  );

  const alsEintrag = (z) => {
    if (!z) return undefined;

    let daten;
    let beschaedigt = false;
    try {
      daten = JSON.parse(z.daten);
    } catch {
      daten = {};
      beschaedigt = true;
    }

    return {
      id: z.id,
      name: z.name,
      art: z.art,
      notiz: z.notiz ?? '',
      daten,
      beschaedigt,
      erstelltAm: z.erstellt_am,
      geaendertAm: z.geaendert_am,
    };
  };

  return {
    /** @param {{art?: string}} [filter] `art` weggelassen heisst: alle */
    alle(guildId, { art } = {}) {
      const zeilen = art
        ? nachArt.all(verlangtGildenId(guildId), art)
        : alleLesen.all(verlangtGildenId(guildId));
      return zeilen.map(alsEintrag);
    },

    lies(guildId, id) {
      return alsEintrag(einzeln.get(id, verlangtGildenId(guildId)));
    },

    /** @returns {{gesamt: number, [art: string]: number}} */
    zaehle(guildId) {
      const stand = { gesamt: 0 };
      for (const zeile of zaehlen.all(verlangtGildenId(guildId))) {
        stand[zeile.art] = zeile.anzahl;
        stand.gesamt += zeile.anzahl;
      }
      return stand;
    },

    /** @returns {number} die vergebene Kennung */
    lege(guildId, { name, art, notiz = '', daten }) {
      const zeit = jetzt();
      const ergebnis = anlegen.run(
        verlangtGildenId(guildId), name, art, notiz, JSON.stringify(daten), zeit, zeit,
      );
      return Number(ergebnis.lastInsertRowid);
    },

    /** @returns {boolean} ob es die Nachricht auf diesem Server gab */
    aendere(guildId, id, { name, art, notiz = '', daten }) {
      return (
        aendern.run(name, art, notiz, JSON.stringify(daten), jetzt(), id, verlangtGildenId(guildId))
          .changes > 0
      );
    },

    /** @returns {boolean} ob etwas gelöscht wurde */
    loesche(guildId, id) {
      return loeschen.run(id, verlangtGildenId(guildId)).changes > 0;
    },
  };
}
