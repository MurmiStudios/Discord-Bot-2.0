import { klartext, istVoruebergehend } from '../discord/fehler.mjs';
import { VORGANG } from '../daten/versand.mjs';
import { GRUPPE, ERGEBNIS } from '../protokoll/protokoll.mjs';

/** Wie oft eine Bremse abgewartet wird, bevor der Empfänger als nicht erreichbar gilt. */
const HOECHSTVERSUCHE = 3;

/** Wartezeit nach einer Bremse: 5 s, 10 s, 20 s. Discord beruhigt sich meist schneller. */
const BREMSPAUSE_MS = 5000;

const standardWarte = (ms) => new Promise((fertig) => setTimeout(fertig, ms));

/**
 * Der Massenversand.
 *
 * Läuft im Hintergrund und schreibt seinen Fortschritt nach jedem einzelnen
 * Empfänger in die Datenbank. Das ist bewusst nicht am Ende gesammelt: Die
 * Fortschrittsanzeige liest genau diese Zahlen, und ein Neustart soll sagen
 * können, wie weit der Versand kam.
 *
 * Ein Fehlschlag bei einem Empfänger stoppt nichts. Wer keine
 * Direktnachrichten annimmt, ist kein Grund, die übrigen neunundneunzig nicht
 * zu benachrichtigen — er wird vermerkt, im Klartext, und der Versand geht weiter.
 *
 * Eine Bremse von Discord ist etwas anderes als eine Ablehnung: Dort wird
 * gewartet und erneut versucht, statt den Empfänger abzuschreiben.
 */
export function erstelleWarteschlange({
  ablage,
  senden,
  protokoll,
  logger,
  konfig,
  warte = standardWarte,
}) {
  async function sendeAnEinen(guildId, vorgangId, empfaenger, nachricht) {
    for (let versuch = 1; versuch <= HOECHSTVERSUCHE; versuch += 1) {
      try {
        await senden(empfaenger, nachricht);
        ablage.merkeErgebnis(guildId, vorgangId, { empfaengerId: empfaenger.id, zugestellt: true });
        return;
      } catch (fehler) {
        if (istVoruebergehend(fehler) && versuch < HOECHSTVERSUCHE) {
          // Bremse: warten und noch einmal versuchen. Die Pause waechst, damit
          // wir nicht sofort wieder in dieselbe Grenze laufen.
          await warte(BREMSPAUSE_MS * versuch);
          continue;
        }

        ablage.merkeErgebnis(guildId, vorgangId, {
          empfaengerId: empfaenger.id,
          zugestellt: false,
          grund: klartext(fehler),
        });
        logger.warn('versand', 'Empfänger nicht erreicht', {
          vorgang: vorgangId,
          empfaenger: empfaenger.id,
          grund: klartext(fehler),
        });
        return;
      }
    }
  }

  async function arbeite(guildId, vorgangId, nachricht, akteur, betreff) {
    // Einmal die Kontrolle abgeben, bevor der erste Versand losgeht: Sonst
    // liefe er synchron im Aufrufer von `starte`, und die Seite bekaeme ihre
    // Vorgangs-ID erst, wenn schon eine Nachricht draussen ist.
    await Promise.resolve();

    const offene = ablage.offeneZiele(vorgangId);

    for (const [i, empfaenger] of offene.entries()) {
      // Vor dem ersten wird nicht gewartet — die Pause gehoert zwischen zwei
      // Nachrichten, nicht vor die erste.
      if (i > 0) await warte(konfig.dmPauseMs);
      await sendeAnEinen(guildId, vorgangId, empfaenger, nachricht);
    }

    ablage.schliesseAb(guildId, vorgangId, VORGANG.FERTIG);

    const stand = ablage.status(guildId, vorgangId);
    protokoll.schreibe(guildId, {
      art: 'versand.abgeschlossen',
      gruppe: GRUPPE.NACHRICHTEN,
      ergebnis: stand.fehlgeschlagen > 0 ? ERGEBNIS.FEHLER : ERGEBNIS.ERFOLG,
      akteur,
      betreff,
      klartext:
        `${stand.zugestellt} von ${stand.gesamt} zugestellt` +
        (stand.fehlgeschlagen > 0 ? `, ${stand.fehlgeschlagen} nicht erreicht` : ''),
    });
  }

  return {
    /**
     * Startet einen Versand im Hintergrund.
     *
     * `fertig` ist das Versprechen auf das Ende — im Betrieb wird es nicht
     * abgewartet, in Tests schon.
     */
    starte(guildId, { nachricht, empfaenger, akteur, betreff, art = 'dm' }) {
      const vorgangId = ablage.beginne(guildId, { art, empfaenger, akteur, betreff });

      const fertig = arbeite(guildId, vorgangId, nachricht, akteur, betreff).catch((fehler) => {
        logger.fehler('versand', 'Versand abgebrochen', fehler);
        ablage.schliesseAb(guildId, vorgangId, VORGANG.ABGEBROCHEN);
      });

      return { vorgangId, fertig };
    },

    /**
     * Beim Start aufzurufen: Ein Vorgang, der noch „läuft", kann es nicht —
     * der Prozess, der ihn betrieb, ist weg. Er wird als abgebrochen markiert
     * und behält seinen Zählerstand, damit sichtbar bleibt, wie weit er kam.
     */
    brichLaufendeAb(guildId) {
      const anzahl = ablage.brichLaufendeAb(guildId);
      if (anzahl > 0) {
        logger.warn('versand', 'Laufende Versände nach Neustart abgebrochen', { anzahl });
      }
      return anzahl;
    },
  };
}
