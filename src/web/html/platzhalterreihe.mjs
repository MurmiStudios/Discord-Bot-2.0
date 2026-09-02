import { html } from './html.mjs';
import { PLATZHALTER } from '../../nachricht/platzhalter.mjs';

/**
 * Eine Reihe Variablen-Knöpfe, die zu genau einem Feld gehört.
 *
 * Jeder Knopf trägt sein Ziel im eigenen Wert (`embedTitel|{user}`). Deshalb
 * braucht die Seite keinen Zustand darüber, welches Feld gerade gemeint ist:
 * Beim Absenden schickt der Browser nur den geklickten Knopf mit — und der
 * weiß, wohin er gehört.
 *
 * Das ersetzt die frühere Zielwahl. Sie funktionierte, verlangte aber, dass man
 * erst ein Auswahlfeld bedient, bevor man auf eine Variable klickt. Eine Reihe
 * direkt unter dem Feld beantwortet die Frage „wohin?" schon durch ihre Lage.
 */
export function platzhalterreihe(ziel, { beschriftung } = {}) {
  return html`
    <div class="platzhalterreihe${beschriftung ? '' : ' platzhalterreihe-klein'}">
      <span class="platzhalter-titel">${beschriftung ?? 'Variablen'}</span>
      ${PLATZHALTER.map(
        (platzhalter) => html`
          <button
            type="submit"
            name="platzhalterEinfuegen"
            value="${ziel}|${platzhalter.name}"
            class="platzhalter-knopf"
            title="${platzhalter.erklaerung}"
          >${platzhalter.name}</button>
        `,
      )}
    </div>
  `;
}
