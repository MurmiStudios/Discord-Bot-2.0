import { alsAblage } from '../../nachricht/entwurf.mjs';

/**
 * Einen Entwurf in die Ablage schreiben.
 *
 * Steht für sich, weil es zwei Aufrufer gibt: den Knopf „Speichern" im Editor
 * und den Versandstart, der eine benannte Nachricht mitspeichert. Zweimal
 * geschrieben liefe beides irgendwann auseinander.
 *
 * @returns {number|null} die Kennung, oder null wenn kein Name dasteht
 */
export function speichereEntwurf(ablage, guildId, entwurf) {
  const name = entwurf.name.trim();
  if (!ablage || name === '') return null;

  return ablage.lege(guildId, {
    name,
    art: entwurf.art,
    daten: alsAblage(entwurf),
  });
}
