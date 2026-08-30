/**
 * Liest die registrierten Routen samt ihrer Zugriffsstufe aus der App.
 *
 * Existiert fuer genau einen Zweck: Ein Test fuehrt diese Liste gegen die
 * Rechtematrix und schlaegt fehl, sobald eine Route weder `verlangt(...)` noch
 * `oeffentlich()` traegt. Damit kann eine spaeter hinzugefuegte Seite nicht
 * versehentlich ungeschuetzt bleiben — auch keine, die es heute noch nicht gibt.
 */
export function routenUebersicht(app) {
  const stack = app.router?.stack ?? app._router?.stack ?? [];
  const uebersicht = [];

  for (const schicht of stack) {
    if (!schicht.route) continue;

    for (const methode of Object.keys(schicht.route.methods)) {
      // Die Stufe haengt an der Middleware, die fuer diese Methode registriert
      // wurde — bei app.route() koennen GET und POST verschiedene haben.
      const stufe = schicht.route.stack
        .filter((eintrag) => !eintrag.method || eintrag.method === methode)
        .map((eintrag) => eintrag.handle?.stufe)
        .find((wert) => wert !== undefined);

      uebersicht.push({ methode: methode.toUpperCase(), pfad: schicht.route.path, stufe });
    }
  }

  return uebersicht;
}
