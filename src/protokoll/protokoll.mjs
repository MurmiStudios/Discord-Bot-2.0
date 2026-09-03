import { verlangtGildenId, jetzt } from '../daten/repository.mjs';
import { saeubere, brauchbareGeheimnisse } from '../kern/maskieren.mjs';

/**
 * Vorgangsgruppen — die vier Filter neben „Alle“.
 *
 * Discord-Vorgänge lassen sich in acht Arten zerlegen, aber danach fragt
 * niemand. Gefragt wird: Ging eine Nachricht raus? Hat sich eine Rolle
 * bewegt? Wer war angemeldet? Was ist schiefgegangen. Deshalb vier Gruppen und
 * eine feinere `art` daneben, die im Klartext steht.
 */
export const GRUPPE = Object.freeze({
  NACHRICHTEN: 'nachrichten',
  ROLLEN: 'rollen',
  ANMELDUNGEN: 'anmeldungen',
  SONSTIGES: 'sonstiges',
});

export const ERGEBNIS = Object.freeze({ ERFOLG: 'erfolg', FEHLER: 'fehler' });

const GRUPPEN = new Set(Object.values(GRUPPE));
const PRO_SEITE = 50;

/** Der Fehlerfilter ist keine Gruppe, sondern greift quer über alle. */
const FILTER_FEHLER = 'fehler';

export function erstelleProtokoll(db, { geheimnisse = [] } = {}) {
  const echteGeheimnisse = brauchbareGeheimnisse(geheimnisse);

  const einfuegen = db.prepare(`
    INSERT INTO protokoll
      (guild_id, zeit, art, gruppe, ergebnis, akteur_id, akteur_name, betreff, klartext, daten)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const abbilden = (z) => ({
    id: z.id,
    zeit: z.zeit,
    art: z.art,
    gruppe: z.gruppe,
    ergebnis: z.ergebnis,
    akteurId: z.akteur_id,
    akteurName: z.akteur_name,
    betreff: z.betreff,
    klartext: z.klartext,
    daten: z.daten ? JSON.parse(z.daten) : undefined,
  });

  /** Baut die WHERE-Bedingung aus Filter und Suchbegriff. */
  function bedingung(guildId, { gruppe, suche } = {}) {
    const teile = ['guild_id = ?'];
    const werte = [guildId];

    if (gruppe === FILTER_FEHLER) {
      teile.push('ergebnis = ?');
      werte.push(ERGEBNIS.FEHLER);
    } else if (gruppe && GRUPPEN.has(gruppe)) {
      teile.push('gruppe = ?');
      werte.push(gruppe);
    }

    const begriff = String(suche ?? '').trim();
    if (begriff !== '') {
      // % und _ sind in LIKE Platzhalter. Ohne Maskierung faende die Suche
      // nach "%" schlagartig alles — und niemand wuesste, warum.
      const maskiert = begriff.replace(/[\\%_]/g, '\\$&');
      teile.push(
        "(akteur_name LIKE ? ESCAPE '\\' OR betreff LIKE ? ESCAPE '\\' " +
          "OR klartext LIKE ? ESCAPE '\\' OR art LIKE ? ESCAPE '\\')",
      );
      const muster = `%${maskiert}%`;
      werte.push(muster, muster, muster, muster);
    }

    return { wo: teile.join(' AND '), werte };
  }

  return {
    schreibe(guildId, { art, gruppe = GRUPPE.SONSTIGES, ergebnis = ERGEBNIS.ERFOLG, akteur, betreff, klartext, daten }) {
      verlangtGildenId(guildId);
      if (!GRUPPEN.has(gruppe)) {
        throw new Error(`Unbekannte Protokollgruppe: ${gruppe}. Erlaubt: ${[...GRUPPEN].join(', ')}`);
      }

      einfuegen.run(
        guildId,
        jetzt(),
        art,
        gruppe,
        ergebnis,
        akteur?.id ?? null,
        akteur?.name ?? null,
        betreff ?? null,
        klartext ?? null,
        daten === undefined ? null : JSON.stringify(saeubere(daten, echteGeheimnisse)),
      );
    },

    /** @returns {{eintraege: object[], gesamt: number, seiten: number, seite: number}} */
    lies(guildId, { gruppe, suche, seite = 1, proSeite = PRO_SEITE } = {}) {
      verlangtGildenId(guildId);
      const { wo, werte } = bedingung(guildId, { gruppe, suche });

      const gesamt = db.prepare(`SELECT COUNT(*) AS n FROM protokoll WHERE ${wo}`).get(...werte).n;
      const seitenzahl = Math.max(1, Math.ceil(gesamt / proSeite));
      const aktuelle = Math.min(Math.max(1, Number(seite) || 1), seitenzahl);

      const eintraege = db
        .prepare(`SELECT * FROM protokoll WHERE ${wo} ORDER BY id DESC LIMIT ? OFFSET ?`)
        .all(...werte, proSeite, (aktuelle - 1) * proSeite)
        .map(abbilden);

      return { eintraege, gesamt, seiten: seitenzahl, seite: aktuelle };
    },

    zaehleJeFilter(guildId) {
      verlangtGildenId(guildId);
      const zaehle = (zusatz, ...werte) =>
        db.prepare(`SELECT COUNT(*) AS n FROM protokoll WHERE guild_id = ?${zusatz}`).get(guildId, ...werte).n;

      return {
        alle: zaehle(''),
        nachrichten: zaehle(' AND gruppe = ?', GRUPPE.NACHRICHTEN),
        rollen: zaehle(' AND gruppe = ?', GRUPPE.ROLLEN),
        anmeldungen: zaehle(' AND gruppe = ?', GRUPPE.ANMELDUNGEN),
        fehler: zaehle(' AND ergebnis = ?', ERGEBNIS.FEHLER),
      };
    },

    letzte(guildId, anzahl = 5) {
      verlangtGildenId(guildId);
      return db
        .prepare('SELECT * FROM protokoll WHERE guild_id = ? ORDER BY id DESC LIMIT ?')
        .all(guildId, anzahl)
        .map(abbilden);
    },
  };
}
