import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { verlangtGildenId } from '../daten/repository.mjs';

export const COOKIE_NAME = 'panel_sitzung';

/** Eine Woche. Lang genug, um nicht zu nerven; kurz genug, um zu verfallen. */
const LEBENSDAUER_MS = 7 * 24 * 60 * 60 * 1000;

/** 32 Byte, base64url — 256 Bit Zufall, nicht ratbar. */
function neueKennung() {
  return randomBytes(32).toString('base64url');
}

/**
 * Sitzungsverwaltung in der Datenbank.
 *
 * Zwei Entscheidungen, die den Unterschied machen:
 *
 * - Gespeichert wird nur der HMAC der Kennung. Wer die Datei `panel.db` in die
 *   Hand bekommt, kann daraus keine gueltige Sitzung bauen.
 * - Die Sitzung liegt in der Datenbank und nicht im Prozessspeicher, damit ein
 *   Neustart niemanden abmeldet.
 */
export function erstelleSitzungen(db, { sessionSecret, jetzt = () => Date.now(), lebensdauerMs = LEBENSDAUER_MS }) {
  const verstecken = (kennung) =>
    createHmac('sha256', sessionSecret).update(kennung).digest('base64url');

  const anlegen = db.prepare(`
    INSERT INTO sitzungen
      (id, guild_id, discord_user_id, anzeigename, avatar, csrf_token, erstellt_am, gesehen_am, laeuft_ab_am)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const lesen = db.prepare('SELECT * FROM sitzungen WHERE id = ?');
  const beruehren = db.prepare('UPDATE sitzungen SET gesehen_am = ?, laeuft_ab_am = ? WHERE id = ?');
  const entfernen = db.prepare('DELETE FROM sitzungen WHERE id = ?');
  const abgelaufeneEntfernen = db.prepare('DELETE FROM sitzungen WHERE laeuft_ab_am <= ?');

  const abbilden = (zeile) => ({
    guildId: zeile.guild_id,
    discordUserId: zeile.discord_user_id,
    anzeigename: zeile.anzeigename,
    avatar: zeile.avatar,
    csrfToken: zeile.csrf_token,
    erstelltAm: zeile.erstellt_am,
  });

  return {
    /** Legt eine neue Sitzung an und gibt die Kennung genau einmal zurueck. */
    lege_an(guildId, nutzer) {
      verlangtGildenId(guildId);
      const kennung = neueKennung();
      const csrfToken = neueKennung();
      const zeitpunkt = jetzt();

      anlegen.run(
        verstecken(kennung),
        guildId,
        nutzer.discordUserId,
        nutzer.anzeigename ?? null,
        nutzer.avatar ?? null,
        csrfToken,
        new Date(zeitpunkt).toISOString(),
        new Date(zeitpunkt).toISOString(),
        new Date(zeitpunkt + lebensdauerMs).toISOString(),
      );

      return { kennung, csrfToken };
    },

    /**
     * Liest die Sitzung zur Kennung und verlaengert sie dabei — sonst faellt sie
     * jemandem mitten in der Arbeit weg. Abgelaufene werden gleich entfernt.
     */
    lies(kennung) {
      if (typeof kennung !== 'string' || kennung === '') return undefined;

      const id = verstecken(kennung);
      const zeile = lesen.get(id);
      if (!zeile) return undefined;

      const zeitpunkt = jetzt();
      if (Date.parse(zeile.laeuft_ab_am) <= zeitpunkt) {
        entfernen.run(id);
        return undefined;
      }

      beruehren.run(
        new Date(zeitpunkt).toISOString(),
        new Date(zeitpunkt + lebensdauerMs).toISOString(),
        id,
      );
      return abbilden(zeile);
    },

    loesche(kennung) {
      if (typeof kennung !== 'string' || kennung === '') return;
      entfernen.run(verstecken(kennung));
    },

    /** @returns {number} Anzahl der entfernten Sitzungen */
    raeumeAuf() {
      return abgelaufeneEntfernen.run(new Date(jetzt()).toISOString()).changes;
    },

    /**
     * Secure nur bei HTTPS: ueber HTTP wuerde der Browser das Cookie sonst
     * gar nicht erst senden, und niemand koennte sich anmelden.
     */
    cookieOptionen({ sicheresCookie }) {
      return {
        httpOnly: true,
        sameSite: 'lax',
        secure: Boolean(sicheresCookie),
        path: '/',
        maxAge: lebensdauerMs,
      };
    },
  };
}

/** Zeitkonstanter Vergleich — verhindert, dass die Laufzeit das Token verraet. */
export function gleichSicher(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const eins = Buffer.from(a);
  const zwei = Buffer.from(b);
  if (eins.length !== zwei.length) return false;
  return timingSafeEqual(eins, zwei);
}
