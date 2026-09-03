import { alsAblage } from '../../nachricht/entwurf.mjs';

/**
 * Einen Entwurf in die Ablage schreiben.
 *
 * Steht für sich, weil es zwei Aufrufer gibt: den Knopf „Speichern" im Editor
 * und den Versandstart, der eine benannte Nachricht mitspeichert. Zweimal
 * geschrieben liefe beides irgendwann auseinander.
 *
 * Kam der Entwurf aus der Ablage, wird dorthin zurückgeschrieben statt eine
 * zweite Fassung anzulegen. Wer beides will, nimmt in der Liste „Kopie" — sonst
 * hätte man nach dreimal Bearbeiten vier Nachrichten mit demselben Namen.
 *
 * @returns {number|null} die Kennung, oder null wenn kein Name dasteht
 */
export function speichereEntwurf(ablage, guildId, entwurf) {
  const name = entwurf.name.trim();
  if (!ablage || name === '') return null;

  const daten = alsAblage(entwurf);
  const kennung = Number(entwurf.gespeichertId);
  const vorhanden = Number.isInteger(kennung) ? ablage.lies(guildId, kennung) : undefined;

  if (vorhanden) {
    // Die Notiz gehört zur Karte, nicht zum Editor — sie darf beim Speichern
    // aus dem Editor nicht verschwinden.
    ablage.aendere(guildId, vorhanden.id, {
      name, art: entwurf.art, notiz: vorhanden.notiz, daten,
    });
    return vorhanden.id;
  }

  return ablage.lege(guildId, { name, art: entwurf.art, daten });
}
