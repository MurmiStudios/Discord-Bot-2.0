/* Verschieben in der Bildvorschau.
 *
 * Ohne diese Datei fehlt nichts: Die Zahlenfelder sind der vollwertige Weg,
 * eine Position zu setzen, und die Griffe entstehen erst hier — im
 * ausgelieferten HTML gibt es sie nicht.
 *
 * Zwei Entscheidungen, die den Unterschied machen:
 *
 * - Beim Ziehen wandern der Griff und die Zahlenfelder sofort mit, das Bild
 *   selbst erst beim Loslassen. Ein Serverbild je Mausbewegung wäre weder
 *   flüssig noch nötig — und das Bild soll weiterhin vom Renderer kommen und
 *   nicht im Browser nachgebaut werden.
 * - Die Griffe werden hier erzeugt und hier positioniert. Damit steht in keiner
 *   ausgelieferten Zeile HTML ein `style`-Attribut; die Content-Security-Policy
 *   verbietet genau das.
 */
(function () {
  'use strict';

  const flaeche = document.querySelector('[data-ziehflaeche]');
  const bild = document.getElementById('vorlagenvorschau');
  const formular = document.querySelector('form.vorlageneditor');
  if (!flaeche || !bild || !formular) return;

  document.documentElement.classList.add('js-an');

  const feld = (kennung) => document.getElementById(kennung);

  const zahl = (kennung, vorgabe) => {
    const eingabe = feld(kennung);
    const wert = eingabe ? Number(eingabe.value) : Number.NaN;
    return Number.isFinite(wert) ? wert : vorgabe;
  };

  const setze = (kennung, wert) => {
    const eingabe = feld(kennung);
    // Ohne Ereignis: Sonst löste jede Mausbewegung eine neue Vorschau aus.
    if (eingabe) eingabe.value = String(Math.round(wert));
  };

  /**
   * Die verschiebbaren Dinge, jedes Mal frisch aus dem Formular gelesen.
   *
   * Es gibt hier absichtlich keinen zwischengespeicherten Zustand: Zeilen
   * kommen dazu und fallen weg, das Profilbild wird an- und abgeschaltet. Das
   * Formular ist die Wahrheit, nicht eine Kopie davon.
   */
  function ziehbares() {
    const liste = [];

    const avatarHaken = formular.querySelector('input[name="avatarAn"][type="checkbox"]');
    if (avatarHaken && avatarHaken.checked) {
      const groesse = zahl('avatarGroesse', 0);
      liste.push({
        art: 'avatar',
        xFeld: 'avatarX',
        yFeld: 'avatarY',
        // Angefasst wird die Mitte, gespeichert die obere linke Ecke.
        versatzX: groesse / 2,
        versatzY: groesse / 2,
        groesse,
        beschriftung: 'Profilbild',
        kurz: '',
      });
    }

    for (let i = 0; feld(`zeileX${i}`); i += 1) {
      liste.push({
        art: 'zeile',
        xFeld: `zeileX${i}`,
        yFeld: `zeileY${i}`,
        versatzX: 0,
        versatzY: 0,
        groesse: 0,
        beschriftung: `Zeile ${i + 1}`,
        kurz: String(i + 1),
      });
    }

    return liste;
  }

  /** Wie viele Bildschirmpunkte ein Bildpunkt der Vorlage gerade breit ist. */
  function massstab() {
    const echt = bild.naturalWidth || Number(bild.getAttribute('width')) || 1;
    return (bild.clientWidth || echt) / echt;
  }

  function vorlagenMasse() {
    return {
      breite: bild.naturalWidth || Number(bild.getAttribute('width')) || 0,
      hoehe: bild.naturalHeight || Number(bild.getAttribute('height')) || 0,
    };
  }

  const klemme = (wert, min, max) => Math.min(max, Math.max(min, wert));

  const griffe = [];
  let ziehtGerade = false;
  let aufbau = '';

  /** Woran man erkennt, dass es andere Griffe braucht — nicht nur andere Lagen. */
  const kennzeichen = (liste) => liste.map((e) => e.art).join(',');

  function baueGriffe(liste) {
    for (const alt of griffe) alt.knopf.remove();
    griffe.length = 0;

    for (const eintrag of liste) {
      const knopf = document.createElement('button');
      knopf.type = 'button';
      knopf.className =
        eintrag.art === 'avatar' ? 'ziehgriff ziehgriff-avatar' : 'ziehgriff ziehgriff-zeile';
      knopf.textContent = eintrag.kurz;
      knopf.title = `${eintrag.beschriftung} verschieben`;
      knopf.setAttribute('aria-label', `${eintrag.beschriftung} verschieben`);
      flaeche.appendChild(knopf);

      const griff = { ...eintrag, knopf };
      griffe.push(griff);
      verbinde(griff);
    }

    zeichneGriffe();
  }

  /**
   * Bringt die Griffe auf den Stand des Formulars.
   *
   * Neu gebaut wird nur, wenn es wirklich andere Griffe braucht — sonst werden
   * die vorhandenen bloss neu gesetzt. Der Unterschied ist nicht kosmetisch:
   * Ein Ankreuzfeld verliert seinen Fokus, sobald man einen Griff anfasst, und
   * löst dabei `change` aus. Würde das die Griffe ersetzen, wäre der eben
   * angefasste weg — und die erste Bewegung nach jeder Eingabe verpuffte.
   */
  function synchronisiere() {
    if (ziehtGerade) return;

    const liste = ziehbares();
    const neu = kennzeichen(liste);

    if (neu === aufbau && griffe.length === liste.length) {
      // Die Griffe stimmen noch; nur Grösse und Lage haben sich geändert.
      for (let i = 0; i < griffe.length; i += 1) griffe[i].versatzX = liste[i].versatzX;
      for (let i = 0; i < griffe.length; i += 1) griffe[i].versatzY = liste[i].versatzY;
      zeichneGriffe();
      return;
    }

    aufbau = neu;
    baueGriffe(liste);
  }

  function zeichneGriffe() {
    const faktor = massstab();

    for (const griff of griffe) {
      const x = (zahl(griff.xFeld, 0) + griff.versatzX) * faktor;
      const y = (zahl(griff.yFeld, 0) + griff.versatzY) * faktor;

      griff.knopf.style.left = `${x}px`;
      griff.knopf.style.top = `${y}px`;

      if (griff.art === 'avatar') {
        const kante = Math.max(24, zahl('avatarGroesse', 0) * faktor);
        griff.knopf.style.width = `${kante}px`;
        griff.knopf.style.height = `${kante}px`;
      }
    }
  }

  function verbinde(griff) {
    let start = null;

    griff.knopf.addEventListener('pointerdown', (ereignis) => {
      ereignis.preventDefault();
      griff.knopf.setPointerCapture(ereignis.pointerId);
      start = {
        zeigerX: ereignis.clientX,
        zeigerY: ereignis.clientY,
        x: zahl(griff.xFeld, 0),
        y: zahl(griff.yFeld, 0),
        faktor: massstab(),
      };
      griff.knopf.classList.add('ziehgriff-aktiv');
      ziehtGerade = true;
    });

    griff.knopf.addEventListener('pointermove', (ereignis) => {
      if (!start) return;

      const masse = vorlagenMasse();
      const neuX = start.x + (ereignis.clientX - start.zeigerX) / start.faktor;
      const neuY = start.y + (ereignis.clientY - start.zeigerY) / start.faktor;

      // Der angefasste Punkt bleibt im Bild. Das Profilbild darf dabei über den
      // Rand hinausragen — nur seine Mitte nicht.
      setze(griff.xFeld, klemme(neuX, -griff.versatzX, masse.breite - griff.versatzX));
      setze(griff.yFeld, klemme(neuY, -griff.versatzY, masse.hoehe - griff.versatzY));
      zeichneGriffe();
    });

    const beenden = () => {
      if (!start) return;
      start = null;
      ziehtGerade = false;
      griff.knopf.classList.remove('ziehgriff-aktiv');
      // Jetzt erst das neue Bild holen — ein Mal, statt bei jeder Bewegung.
      formular.dispatchEvent(new Event('input', { bubbles: true }));
    };

    griff.knopf.addEventListener('pointerup', beenden);
    griff.knopf.addEventListener('pointercancel', beenden);

    // Mit der Tastatur, weil ein Griff, den man nur mit der Maus erreicht,
    // für einen Teil der Leute gar nicht da ist.
    griff.knopf.addEventListener('keydown', (ereignis) => {
      const richtung = {
        ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1],
      }[ereignis.key];
      if (!richtung) return;

      ereignis.preventDefault();
      const schritt = ereignis.shiftKey ? 10 : 1;
      setze(griff.xFeld, zahl(griff.xFeld, 0) + richtung[0] * schritt);
      setze(griff.yFeld, zahl(griff.yFeld, 0) + richtung[1] * schritt);
      zeichneGriffe();
      formular.dispatchEvent(new Event('input', { bubbles: true }));
    });
  }

  // Ein neues Vorschaubild kann eine andere Grösse haben — dann stimmen die
  // Griffe erst wieder, wenn es geladen ist.
  bild.addEventListener('load', zeichneGriffe);
  window.addEventListener('resize', zeichneGriffe);

  // Zeilen kommen und gehen, das Profilbild wird an- und abgeschaltet —
  // `synchronisiere` entscheidet, ob das neue Griffe braucht.
  formular.addEventListener('input', synchronisiere);
  formular.addEventListener('change', synchronisiere);

  synchronisiere();
})();
