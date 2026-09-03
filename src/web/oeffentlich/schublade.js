/* Die Entwurfs-Schublade.
 *
 * Ohne diese Datei ist „Gespeicherte Nachrichten …" ein gewöhnlicher Verweis
 * auf die Liste — eine Seite mit demselben Inhalt. Hier wird daraus ein
 * Schalter, der die Liste einblendet, ohne den Editor zu verlassen.
 *
 * Der Verweis behält sein `href`: Mittelklick und „in neuem Tab öffnen"
 * funktionieren weiter, so wie man es von einem Verweis erwartet.
 */
(function () {
  'use strict';

  const schalter = document.getElementById('schubladen-schalter');
  const lade = document.getElementById('schublade');
  if (!schalter || !lade) return;

  document.documentElement.classList.add('js-an');

  const zuKnopf = document.getElementById('schublade-zu');
  let vorherFokussiert = null;

  const istOffen = () => !lade.hidden;

  function oeffne() {
    vorherFokussiert = document.activeElement;
    lade.hidden = false;
    schalter.setAttribute('aria-expanded', 'true');
    // Der erste Eintrag bekommt den Fokus — sonst müsste man sich mit der
    // Tastatur erst durch den ganzen Editor zurückarbeiten.
    const erster = lade.querySelector('.schubladeneintrag') ?? zuKnopf;
    if (erster) erster.focus();
  }

  function schliesse() {
    lade.hidden = true;
    schalter.setAttribute('aria-expanded', 'false');
    if (vorherFokussiert && vorherFokussiert.focus) vorherFokussiert.focus();
  }

  schalter.setAttribute('role', 'button');
  schalter.setAttribute('aria-expanded', 'false');

  schalter.addEventListener('click', (ereignis) => {
    // Mit Zusatztaste bleibt es ein Verweis: neuer Tab, neues Fenster.
    if (ereignis.metaKey || ereignis.ctrlKey || ereignis.shiftKey || ereignis.button !== 0) return;
    ereignis.preventDefault();
    if (istOffen()) schliesse();
    else oeffne();
  });

  if (zuKnopf) zuKnopf.addEventListener('click', schliesse);

  document.addEventListener('keydown', (ereignis) => {
    if (ereignis.key === 'Escape' && istOffen()) {
      ereignis.preventDefault();
      schliesse();
    }
  });

  // Ein Klick daneben schliesst ebenfalls — aber nicht der Klick, der sie
  // gerade geöffnet hat.
  document.addEventListener('click', (ereignis) => {
    if (!istOffen()) return;
    if (lade.contains(ereignis.target) || schalter.contains(ereignis.target)) return;
    schliesse();
  });
})();
