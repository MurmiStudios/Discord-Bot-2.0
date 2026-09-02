import { ART, leeresEmbed } from './modell.mjs';
import { MODUS } from './vorschau.mjs';
import { parseAuswahl, alsAuswahlWert } from '../versand/empfaenger.mjs';
import { html } from '../web/html/html.mjs';

/** Ein wiederholtes Formularfeld kommt einzeln oder als Liste — immer als Liste behandeln. */
const alsListe = (wert) => (wert === undefined ? [] : Array.isArray(wert) ? wert : [wert]);

/**
 * Baut den Entwurf aus dem Formularkörper.
 *
 * Jede Seitenaktion geht durch diese eine Funktion. Dadurch gibt es genau einen
 * Ort, an dem aus Formulardaten ein Entwurf wird — und keine Aktion, die
 * versehentlich einen Teil davon vergisst. Auch die Bestätigungsseite und der
 * Versandstart lesen ihn so, statt eigene Felder zu kennen.
 */
export function entwurfAus(koerper = {}) {
  const namen = alsListe(koerper.embedFeldName);
  const werte = alsListe(koerper.embedFeldWert);

  return {
    art: koerper.art === ART.KANAL ? ART.KANAL : ART.DM,
    text: String(koerper.text ?? ''),
    bildvorlageId: String(koerper.bildvorlageId ?? '') || null,
    vorschauModus: koerper.vorschauModus === MODUS.ROH ? MODUS.ROH : MODUS.BEISPIEL,
    empfaenger: parseAuswahl(koerper.empfaenger),
    empfaengerSuche: String(koerper.empfaengerSuche ?? ''),
    kanalId: String(koerper.kanalId ?? '') || null,
    kanalSuche: String(koerper.kanalSuche ?? ''),
    embedAn: koerper.embedAn === 'ja',
    embed: {
      ...leeresEmbed(),
      titel: String(koerper.embedTitel ?? ''),
      beschreibung: String(koerper.embedBeschreibung ?? ''),
      fusszeile: String(koerper.embedFusszeile ?? ''),
      autor: String(koerper.embedAutor ?? ''),
      farbe: String(koerper.embedFarbe ?? '') || null,
      felder: namen.map((name, i) => ({ name: String(name), wert: String(werte[i] ?? '') })),
    },
  };
}

/** Der Entwurf in der Form, die pruefeNachricht erwartet. */
export function alsEingabe(entwurf) {
  return {
    art: entwurf.art,
    text: entwurf.text,
    bildvorlageId: entwurf.bildvorlageId ?? '',
    embedAn: entwurf.embedAn ? 'ja' : 'nein',
    embedTitel: entwurf.embed.titel,
    embedBeschreibung: entwurf.embed.beschreibung,
    embedFusszeile: entwurf.embed.fusszeile,
    embedAutor: entwurf.embed.autor,
    embedFarbe: entwurf.embed.farbe ?? '',
    embedFelder: entwurf.embed.felder,
  };
}

/** Die Nachricht, wie der Versand sie braucht — ohne Oberflächenkram. */
export function alsNachricht(entwurf) {
  return {
    text: entwurf.text,
    embed: entwurf.embedAn ? entwurf.embed : null,
    bildvorlageId: entwurf.bildvorlageId,
  };
}

/**
 * Der ganze Entwurf als versteckte Felder.
 *
 * So trägt die Bestätigungsseite ihn weiter, ohne dass der Server sich zwischen
 * zwei Aufrufen etwas merken muss. Kein Zwischenspeicher, der veralten kann.
 */
export function entwurfAlsFelder(entwurf) {
  const feld = (name, wert) => html`<input type="hidden" name="${name}" value="${wert ?? ''}">`;

  return html`
    ${feld('art', entwurf.art)}
    ${feld('text', entwurf.text)}
    ${feld('bildvorlageId', entwurf.bildvorlageId)}
    ${entwurf.kanalId ? feld('kanalId', entwurf.kanalId) : ''}
    ${entwurf.empfaenger.map((e) => feld('empfaenger', alsAuswahlWert(e)))}
    ${entwurf.embedAn
      ? html`
          ${feld('embedAn', 'ja')}
          ${feld('embedTitel', entwurf.embed.titel)}
          ${feld('embedBeschreibung', entwurf.embed.beschreibung)}
          ${feld('embedFusszeile', entwurf.embed.fusszeile)}
          ${feld('embedAutor', entwurf.embed.autor)}
          ${feld('embedFarbe', entwurf.embed.farbe)}
          ${entwurf.embed.felder.map(
            (f) => html`${feld('embedFeldName', f.name)}${feld('embedFeldWert', f.wert)}`,
          )}
        `
      : ''}
  `;
}
