import { ersetze } from './platzhalter.mjs';
import { embedHatInhalt } from './modell.mjs';

const HEXFARBE = /^#([0-9a-f]{6})$/i;

/**
 * Aus dem Nachrichtenmodell die Nutzlast machen, die discord.js erwartet.
 *
 * Hier werden die Platzhalter eingesetzt — je Empfänger neu, denn genau das
 * ist ihr Zweck. Leere Teile werden weggelassen statt als leerer Text
 * geschickt: Discord lehnt ein Embed mit leerem Titel ab.
 *
 * @param {object} nachricht  Modell mit text, embed
 * @param {object} werte      Platzhalterwerte für diesen einen Empfänger
 * @param {{name: string, daten: Buffer}[]} [anhaenge]  je Empfänger erzeugte Bilder
 * @returns {object|null} Nutzlast, oder null wenn nichts zu senden ist
 */
export function alsDiscordNachricht(nachricht, werte, anhaenge = []) {
  const content = ersetze(nachricht?.text ?? '', werte);
  const embed = baueEmbed(nachricht?.embed, werte);

  // Ein Bild allein ist Inhalt: Eine Willkommenskarte braucht keinen Text.
  if (content.trim() === '' && !embed && anhaenge.length === 0) return null;

  const nutzlast = {};
  if (content.trim() !== '') nutzlast.content = content;

  if (anhaenge.length > 0) {
    nutzlast.files = anhaenge.map((anhang) => ({ attachment: anhang.daten, name: anhang.name }));
  }

  // Traegt die Nachricht beides, gehoert das Bild *in* die Karte.
  //
  // Discord zeigt einen Anhang genau einmal: entweder unter der Nachricht oder
  // im Embed, das ihn mit `attachment://` anspricht. Ohne diese Zeile haengt
  // die Willkommenskarte unter der Karte statt darin — zwei Bloecke, wo einer
  // gemeint war.
  if (embed) {
    if (anhaenge.length > 0) embed.image = { url: `attachment://${anhaenge[0].name}` };
    nutzlast.embeds = [embed];
  }

  return nutzlast;
}

function baueEmbed(embed, werte) {
  if (!embedHatInhalt(embed)) return null;

  const aus = {};
  const setze = (schluessel, roh) => {
    const wert = ersetze(roh ?? '', werte);
    if (wert.trim() !== '') aus[schluessel] = wert;
  };

  setze('title', embed.titel);
  setze('description', embed.beschreibung);

  const farbe = HEXFARBE.exec(String(embed.farbe ?? ''));
  if (farbe) aus.color = Number.parseInt(farbe[1], 16);

  const felder = (embed.felder ?? [])
    .filter((feld) => String(feld.name ?? '').trim() !== '' && String(feld.wert ?? '').trim() !== '')
    .map((feld) => ({ name: ersetze(feld.name, werte), value: ersetze(feld.wert, werte) }));
  if (felder.length > 0) aus.fields = felder;

  const fusszeile = ersetze(embed.fusszeile ?? '', werte);
  if (fusszeile.trim() !== '') aus.footer = { text: fusszeile };

  const autor = ersetze(embed.autor ?? '', werte);
  if (autor.trim() !== '') aus.author = { name: autor };

  return aus;
}
