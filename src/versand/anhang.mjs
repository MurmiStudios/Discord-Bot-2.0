import { rendere } from '../bilder/renderer.mjs';
import { sichereVorlage } from '../bilder/vorlage.mjs';
import { bildPfad } from '../bilder/upload.mjs';
import { platzhalterWerte } from '../nachricht/werte.mjs';

/**
 * Das Bild, das eine Nachricht mitbringt — je Empfänger ein eigenes.
 *
 * Das ist der ganze Zweck der Bildvorlagen: Nicht ein Bild für alle, sondern
 * für jeden dasselbe Muster mit seinem Namen und seinem Profilbild.
 *
 * Die Empfängerdaten werden hier frisch aus dem Guild-Cache geholt und nicht
 * aus dem Versandvorgang gelesen. Der kennt nur Kennung und Namen — mehr
 * braucht er auch nicht, damit ein Neustart einen Versand fortsetzen kann.
 * Profilbild und Benutzername gehören nicht in die Datenbank, sie ändern sich.
 */

export class VorlagenFehler extends Error {
  constructor(meldung) {
    super(meldung);
    this.name = 'VorlagenFehler';
  }
}

/** Aus „Willkommen auf dem Server!" wird „willkommen-auf-dem-server.png". */
function dateiname(name) {
  const sauber = String(name ?? '')
    .toLowerCase()
    .replace(/[äöüß]/g, (z) => ({ ä: 'ae', ö: 'oe', ü: 'ue', ß: 'ss' })[z])
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);

  return `${sauber || 'bild'}.png`;
}

export function erstelleBildAnhang({
  bildvorlagen, gildenAnsicht, avatarQuelle, konfig, bilderVerzeichnis,
}) {
  return {
    /**
     * @returns {Promise<{name: string, daten: Buffer}|null>} null, wenn die
     *          Nachricht gar keine Bildvorlage trägt
     * @throws {VorlagenFehler} wenn sie eine trägt, die es nicht mehr gibt
     */
    async fuer(nachricht, empfaenger) {
      const roh = nachricht?.bildvorlageId;
      if (roh === null || roh === undefined || roh === '') return null;

      const kennung = Number(roh);
      const eintrag = Number.isInteger(kennung)
        ? bildvorlagen.lies(konfig.guildId, kennung)
        : undefined;

      // Lieber ein sichtbarer Fehlschlag als eine Nachricht ohne das Bild, das
      // sie ankündigt. Die Warteschlange vermerkt den Grund je Empfänger, und
      // auf der Fortschrittsseite steht er im Klartext.
      if (!eintrag) {
        throw new VorlagenFehler(
          'Die Bildvorlage dieser Nachricht gibt es nicht mehr. Wähle eine andere aus.',
        );
      }

      const mitglied = gildenAnsicht.findeMitglied(empfaenger?.id, konfig.guildId);
      const rolle = mitglied
        ? gildenAnsicht.rollen(konfig.guildId).find((r) => mitglied.rollenIds.includes(r.id))
        : undefined;

      const png = await rendere(
        {
          ...sichereVorlage(eintrag.vorlage),
          hintergrundBild: bildPfad(bilderVerzeichnis, eintrag.vorlage.hintergrundBild),
        },
        {
          ...platzhalterWerte({
            // Der Name aus dem Vorgang hat Vorrang: Er ist der, den beim
            // Bestätigen jemand vor sich gesehen hat.
            nutzer: { name: empfaenger?.name ?? mitglied?.name, tag: mitglied?.tag },
            gilde: gildenAnsicht.gildenInfo(konfig.guildId),
            rolle: rolle?.name,
          }),
          avatarBild: mitglied ? await avatarQuelle.fuer(mitglied.avatarUrl) : null,
        },
      );

      return { name: dateiname(eintrag.name), daten: png };
    },
  };
}
