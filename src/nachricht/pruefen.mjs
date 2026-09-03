import { GRENZE, ART, embedZeichen, istLeer, leeresEmbed } from './modell.mjs';

/**
 * Prüft eine Formulareingabe und gibt entweder einen sauberen Wert oder eine
 * Liste benannter Fehler zurück.
 *
 * Grundsätze:
 * - Nie stillschweigend beschneiden. Wer 2500 Zeichen schreibt, soll das
 *   erfahren, statt eine halbe Nachricht zu verschicken.
 * - Nur bekannte Felder übernehmen. Was im Formular nicht vorgesehen ist,
 *   landet auch nicht im Wert.
 * - Alle Fehler auf einmal, mit Feldnamen — damit die Seite sie an der
 *   richtigen Stelle anzeigen kann.
 */

const text = (wert) => (wert === undefined || wert === null ? '' : String(wert));

function pruefeLaenge(fehler, feld, wert, grenze, was) {
  if (wert.length > grenze) {
    fehler.push({
      feld,
      meldung: `${was} ist ${wert.length} Zeichen lang — erlaubt sind ${grenze}.`,
    });
  }
}

function baueEmbed(eingabe, fehler) {
  if (eingabe.embedAn !== 'ja') return null;

  const embed = {
    ...leeresEmbed(),
    titel: text(eingabe.embedTitel),
    beschreibung: text(eingabe.embedBeschreibung),
    fusszeile: text(eingabe.embedFusszeile),
    autor: text(eingabe.embedAutor),
    farbe: text(eingabe.embedFarbe) || null,
    felder: (Array.isArray(eingabe.embedFelder) ? eingabe.embedFelder : []).map((feld) => ({
      name: text(feld?.name),
      wert: text(feld?.wert),
    })),
  };

  pruefeLaenge(fehler, 'embedTitel', embed.titel, GRENZE.TITEL, 'Der Titel');
  pruefeLaenge(fehler, 'embedBeschreibung', embed.beschreibung, GRENZE.BESCHREIBUNG, 'Die Beschreibung');
  pruefeLaenge(fehler, 'embedFusszeile', embed.fusszeile, GRENZE.FUSSZEILE, 'Die Fußzeile');
  pruefeLaenge(fehler, 'embedAutor', embed.autor, GRENZE.AUTOR, 'Der Autor');

  if (embed.felder.length > GRENZE.FELDER) {
    fehler.push({
      feld: 'embedFelder',
      meldung: `Ein Embed kann höchstens ${GRENZE.FELDER} Felder haben, hier sind es ${embed.felder.length}.`,
    });
  }

  embed.felder.forEach((feld, i) => {
    if (feld.name.trim() === '' || feld.wert.trim() === '') {
      fehler.push({
        feld: 'embedFelder',
        meldung: `Feld ${i + 1} braucht Namen und Wert — Discord nimmt es sonst nicht an.`,
      });
    }
    pruefeLaenge(fehler, 'embedFelder', feld.name, GRENZE.FELD_NAME, `Der Name von Feld ${i + 1}`);
    pruefeLaenge(fehler, 'embedFelder', feld.wert, GRENZE.FELD_WERT, `Der Wert von Feld ${i + 1}`);
  });

  const gesamt = embedZeichen(embed);
  if (gesamt > GRENZE.EMBED_GESAMT) {
    fehler.push({
      feld: 'embed',
      meldung:
        `Das Embed hat ${gesamt} Zeichen. Discord rechnet Titel, Beschreibung, alle Feldnamen ` +
        `und -werte, Fußzeile und Autor gegen ein gemeinsames Limit von ${GRENZE.EMBED_GESAMT}.`,
    });
  }

  return embed;
}

export function pruefeNachricht(eingabe, { darfLeerSein = false } = {}) {
  const fehler = [];

  const art = text(eingabe.art);
  if (art !== ART.DM && art !== ART.KANAL) {
    fehler.push({ feld: 'art', meldung: 'Unbekannte Art. Erlaubt sind „dm" und „kanal".' });
  }

  const nachrichtenText = text(eingabe.text);
  pruefeLaenge(fehler, 'text', nachrichtenText, GRENZE.TEXT, 'Der Text');

  const embed = baueEmbed(eingabe, fehler);

  const wert = {
    name: text(eingabe.name).trim(),
    art,
    text: nachrichtenText,
    embed,
    bildvorlageId: text(eingabe.bildvorlageId) || null,
    aktionsleisteId: text(eingabe.aktionsleisteId) || null,
  };

  // `darfLeerSein` ist fuer Entwuerfe, die noch nicht raus sollen — eine
  // ausgeschaltete Automatik zum Beispiel. Wer sie einschaltet, bekommt die
  // Meldung dort, wo sie hingehoert: am Schalter.
  if (!darfLeerSein && istLeer(wert)) {
    fehler.push({
      feld: 'text',
      meldung:
        'Die Nachricht ist leer. Sie braucht mindestens einen Text, eine Embed-Karte oder eine Bildvorlage.',
    });
  }

  if (fehler.length > 0) return { ok: false, fehler };
  return { ok: true, wert, fehler: [] };
}
