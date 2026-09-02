import { verlangtGildenId, jetzt } from './repository.mjs';

export const VORGANG = Object.freeze({ LAEUFT: 'laeuft', FERTIG: 'fertig', ABGEBROCHEN: 'abgebrochen' });
export const ZIEL = Object.freeze({ OFFEN: 'offen', ZUGESTELLT: 'zugestellt', FEHLGESCHLAGEN: 'fehlgeschlagen' });

/**
 * Ablage für Versandvorgänge.
 *
 * Der Fortschritt wird nach jedem einzelnen Empfänger fortgeschrieben, nicht
 * am Ende gesammelt. Das kostet einen Schreibvorgang je Empfänger und ist
 * genau das, was die Fortschrittsanzeige braucht — und was einem Neustart
 * sagt, wie weit der Versand kam.
 */
export function erstelleVersandAblage(db) {
  const beginnen = db.prepare(`
    INSERT INTO versandvorgaenge (guild_id, art, zustand, begonnen_am, gesamt, akteur_id, akteur_name, betreff)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const zielAnlegen = db.prepare(`
    INSERT INTO versandziele (vorgang_id, guild_id, empfaenger_id, empfaenger_name, zustand)
    VALUES (?, ?, ?, ?, ?)
  `);
  const zielSetzen = db.prepare(`
    UPDATE versandziele SET zustand = ?, grund = ?, zeit = ?
    WHERE vorgang_id = ? AND guild_id = ? AND empfaenger_id = ?
  `);
  const zaehlerErhoehen = db.prepare(`
    UPDATE versandvorgaenge
    SET erledigt = erledigt + 1,
        zugestellt = zugestellt + ?,
        fehlgeschlagen = fehlgeschlagen + ?
    WHERE id = ? AND guild_id = ?
  `);
  const abschliessen = db.prepare(
    'UPDATE versandvorgaenge SET zustand = ?, beendet_am = ? WHERE id = ? AND guild_id = ?',
  );
  const statusLesen = db.prepare('SELECT * FROM versandvorgaenge WHERE id = ? AND guild_id = ?');
  const zieleLesen = db.prepare(
    'SELECT * FROM versandziele WHERE vorgang_id = ? AND guild_id = ? ORDER BY id',
  );
  const offeneLesen = db.prepare(
    "SELECT empfaenger_id, empfaenger_name FROM versandziele WHERE vorgang_id = ? AND zustand = 'offen' ORDER BY id",
  );
  const juengsten = db.prepare(
    'SELECT * FROM versandvorgaenge WHERE guild_id = ? ORDER BY id DESC LIMIT 1',
  );
  const laufendeAbbrechen = db.prepare(
    'UPDATE versandvorgaenge SET zustand = ?, beendet_am = ? WHERE guild_id = ? AND zustand = ?',
  );

  const alsVorgang = (z) =>
    z && {
      id: z.id,
      art: z.art,
      zustand: z.zustand,
      begonnenAm: z.begonnen_am,
      beendetAm: z.beendet_am,
      gesamt: z.gesamt,
      erledigt: z.erledigt,
      zugestellt: z.zugestellt,
      fehlgeschlagen: z.fehlgeschlagen,
      akteurName: z.akteur_name,
      betreff: z.betreff,
    };

  const alsZiel = (z) => ({
    empfaengerId: z.empfaenger_id,
    empfaengerName: z.empfaenger_name,
    zustand: z.zustand,
    grund: z.grund,
    zeit: z.zeit,
  });

  return {
    beginne(guildId, { art = 'dm', gesamt, empfaenger = [], akteur, betreff }) {
      verlangtGildenId(guildId);
      const ergebnis = beginnen.run(
        guildId, art, VORGANG.LAEUFT, jetzt(), gesamt ?? empfaenger.length,
        akteur?.id ?? null, akteur?.name ?? null, betreff ?? null,
      );
      const id = Number(ergebnis.lastInsertRowid);
      for (const e of empfaenger) {
        zielAnlegen.run(id, guildId, e.id, e.name ?? null, ZIEL.OFFEN);
      }
      return id;
    },

    offeneZiele(vorgangId) {
      return offeneLesen.all(vorgangId).map((z) => ({ id: z.empfaenger_id, name: z.empfaenger_name }));
    },

    merkeErgebnis(guildId, vorgangId, { empfaengerId, zugestellt, grund = null }) {
      verlangtGildenId(guildId);
      zielSetzen.run(
        zugestellt ? ZIEL.ZUGESTELLT : ZIEL.FEHLGESCHLAGEN,
        grund, jetzt(), vorgangId, guildId, empfaengerId,
      );
      zaehlerErhoehen.run(zugestellt ? 1 : 0, zugestellt ? 0 : 1, vorgangId, guildId);
    },

    schliesseAb(guildId, vorgangId, zustand = VORGANG.FERTIG) {
      verlangtGildenId(guildId);
      abschliessen.run(zustand, jetzt(), vorgangId, guildId);
    },

    status(guildId, vorgangId) {
      return alsVorgang(statusLesen.get(vorgangId, verlangtGildenId(guildId)));
    },

    ziele(guildId, vorgangId) {
      return zieleLesen.all(vorgangId, verlangtGildenId(guildId)).map(alsZiel);
    },

    juengster(guildId) {
      return alsVorgang(juengsten.get(verlangtGildenId(guildId)));
    },

    /** @returns {number} Anzahl der abgebrochenen Vorgänge */
    brichLaufendeAb(guildId) {
      return laufendeAbbrechen.run(
        VORGANG.ABGEBROCHEN, jetzt(), verlangtGildenId(guildId), VORGANG.LAEUFT,
      ).changes;
    },
  };
}
