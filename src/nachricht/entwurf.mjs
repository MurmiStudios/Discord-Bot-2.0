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
    name: String(koerper.name ?? ''),
    // Gesetzt, wenn der Entwurf aus der Ablage kommt. „Speichern“ schreibt dann
    // dorthin zurück, statt eine zweite Fassung anzulegen — für die gibt es in
    // der Liste den Knopf „Kopie“.
    gespeichertId: String(koerper.gespeichertId ?? '') || null,
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
    ${feld('name', entwurf.name)}
    ${entwurf.gespeichertId ? feld('gespeichertId', entwurf.gespeichertId) : ''}
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

/**
 * Der Entwurf, wie er in die Ablage geht.
 *
 * Bewusst in derselben Form, die `entwurfAus` liest — ein Formularkörper.
 * Damit sind Speichern und Öffnen dieselbe Übersetzung in beide Richtungen,
 * und es gibt keine dritte Darstellung einer Nachricht, die man beim nächsten
 * Feld vergessen könnte. Die Oberflächenfelder (Suchbegriffe, Vorschaumodus)
 * bleiben draussen: Sie sind Zustand des Augenblicks, nicht der Nachricht.
 *
 * `zielnamen` ist die eine Ausnahme: ein Schnappschuss der Namen zum Zeitpunkt
 * des Speicherns. `entwurfAus` liest ihn nicht — er dient allein dazu, später
 * sagen zu können, *wer* fehlt, und nicht nur, dass jemand fehlt. Dass er
 * veralten kann, ist kein Mangel: Für eine Warnung ist der alte Name genau der
 * richtige.
 *
 * @param {object} [zielnamen] Auswahlwert → Name, z. B. `{'mitglied:1': 'Anna'}`
 */
export function alsAblage(entwurf, zielnamen) {
  return {
    ...(zielnamen && Object.keys(zielnamen).length > 0 ? { zielnamen } : {}),
    art: entwurf.art,
    text: entwurf.text,
    bildvorlageId: entwurf.bildvorlageId ?? '',
    kanalId: entwurf.kanalId ?? '',
    empfaenger: entwurf.empfaenger.map(alsAuswahlWert),
    embedAn: entwurf.embedAn ? 'ja' : 'nein',
    embedTitel: entwurf.embed.titel,
    embedBeschreibung: entwurf.embed.beschreibung,
    embedFusszeile: entwurf.embed.fusszeile,
    embedAutor: entwurf.embed.autor,
    embedFarbe: entwurf.embed.farbe ?? '',
    embedFeldName: entwurf.embed.felder.map((f) => f.name),
    embedFeldWert: entwurf.embed.felder.map((f) => f.wert),
  };
}

/** Ein kurzer Auszug für die Liste — Text, sonst Embed-Titel, sonst nichts. */
export function auszug(entwurf, laenge = 120) {
  const roh = entwurf.text.trim() || entwurf.embed.titel.trim() || entwurf.embed.beschreibung.trim();
  const einzeilig = roh.replace(/\s+/g, ' ').trim();
  return einzeilig.length > laenge ? `${einzeilig.slice(0, laenge - 1)}…` : einzeilig;
}
