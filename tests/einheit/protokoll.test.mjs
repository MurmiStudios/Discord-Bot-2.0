import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { oeffneDatenbank } from '../../src/daten/db.mjs';
import { migriere, ladeMigrationen } from '../../src/daten/migrieren.mjs';
import { erstelleGilden } from '../../src/daten/gilden.mjs';
import { erstelleProtokoll, GRUPPE, ERGEBNIS } from '../../src/protokoll/protokoll.mjs';
import { GildenFehler } from '../../src/daten/repository.mjs';
import { mitTempVerzeichnis } from '../hilfen/db.mjs';

const GILDE = '111111111111111111';
const FREMD = '222222222222222222';
const AKTEUR = { id: '4242', name: 'Anna' };

async function mitProtokoll(fn) {
  return mitTempVerzeichnis(async (dir) => {
    const db = oeffneDatenbank(join(dir, 'panel.db'));
    migriere(db, ladeMigrationen(new URL('../../src/daten/migrationen/', import.meta.url).pathname));
    const gilden = erstelleGilden(db);
    gilden.merke(GILDE, 'Testserver');
    gilden.merke(FREMD, 'Fremder');
    try {
      return await fn({ db, protokoll: erstelleProtokoll(db) });
    } finally {
      db.close();
    }
  });
}

test('ein Eintrag lässt sich schreiben und wiederfinden', async () => {
  await mitProtokoll(({ protokoll }) => {
    protokoll.schreibe(GILDE, {
      art: 'nachricht.gesendet',
      gruppe: GRUPPE.NACHRICHTEN,
      ergebnis: ERGEBNIS.ERFOLG,
      akteur: AKTEUR,
      betreff: '#willkommen',
    });

    const eintraege = protokoll.lies(GILDE).eintraege;
    assert.equal(eintraege.length, 1);
    assert.equal(eintraege[0].art, 'nachricht.gesendet');
    assert.equal(eintraege[0].akteurName, 'Anna');
    assert.equal(eintraege[0].betreff, '#willkommen');
    assert.ok(!Number.isNaN(Date.parse(eintraege[0].zeit)));
  });
});

test('das Protokoll einer Gilde ist für die andere unsichtbar', async () => {
  await mitProtokoll(({ protokoll }) => {
    protokoll.schreibe(GILDE, { art: 'a', gruppe: GRUPPE.NACHRICHTEN, ergebnis: ERGEBNIS.ERFOLG });

    assert.equal(protokoll.lies(FREMD).eintraege.length, 0);
  });
});

test('ohne Gilden-ID lässt sich nichts schreiben und nichts lesen', async () => {
  await mitProtokoll(({ protokoll }) => {
    assert.throws(() => protokoll.schreibe(undefined, { art: 'a' }), GildenFehler);
    assert.throws(() => protokoll.lies(undefined), GildenFehler);
  });
});

test('die neuesten Einträge stehen oben', async () => {
  await mitProtokoll(({ protokoll }) => {
    protokoll.schreibe(GILDE, { art: 'erster', gruppe: GRUPPE.NACHRICHTEN, ergebnis: ERGEBNIS.ERFOLG });
    protokoll.schreibe(GILDE, { art: 'zweiter', gruppe: GRUPPE.NACHRICHTEN, ergebnis: ERGEBNIS.ERFOLG });

    assert.equal(protokoll.lies(GILDE).eintraege[0].art, 'zweiter');
  });
});

test('nach Gruppe filtern zeigt nur diese Gruppe', async () => {
  await mitProtokoll(({ protokoll }) => {
    protokoll.schreibe(GILDE, { art: 'a', gruppe: GRUPPE.NACHRICHTEN, ergebnis: ERGEBNIS.ERFOLG });
    protokoll.schreibe(GILDE, { art: 'b', gruppe: GRUPPE.ROLLEN, ergebnis: ERGEBNIS.ERFOLG });

    const nurRollen = protokoll.lies(GILDE, { gruppe: GRUPPE.ROLLEN }).eintraege;
    assert.deepEqual(nurRollen.map((e) => e.art), ['b']);
  });
});

test('der Fehlerfilter greift über alle Gruppen hinweg', async () => {
  await mitProtokoll(({ protokoll }) => {
    protokoll.schreibe(GILDE, { art: 'a', gruppe: GRUPPE.NACHRICHTEN, ergebnis: ERGEBNIS.FEHLER });
    protokoll.schreibe(GILDE, { art: 'b', gruppe: GRUPPE.ROLLEN, ergebnis: ERGEBNIS.FEHLER });
    protokoll.schreibe(GILDE, { art: 'c', gruppe: GRUPPE.ROLLEN, ergebnis: ERGEBNIS.ERFOLG });

    const fehler = protokoll.lies(GILDE, { gruppe: 'fehler' }).eintraege;
    assert.deepEqual(fehler.map((e) => e.art).sort(), ['a', 'b']);
  });
});

test('die Zählung je Filter stimmt mit den Treffern überein', async () => {
  await mitProtokoll(({ protokoll }) => {
    protokoll.schreibe(GILDE, { art: 'a', gruppe: GRUPPE.NACHRICHTEN, ergebnis: ERGEBNIS.ERFOLG });
    protokoll.schreibe(GILDE, { art: 'b', gruppe: GRUPPE.ROLLEN, ergebnis: ERGEBNIS.FEHLER });
    protokoll.schreibe(GILDE, { art: 'c', gruppe: GRUPPE.ANMELDUNGEN, ergebnis: ERGEBNIS.ERFOLG });

    const zahlen = protokoll.zaehleJeFilter(GILDE);
    assert.equal(zahlen.alle, 3);
    assert.equal(zahlen.nachrichten, 1);
    assert.equal(zahlen.rollen, 1);
    assert.equal(zahlen.anmeldungen, 1);
    assert.equal(zahlen.fehler, 1);
  });
});

test('die Volltextsuche findet über Person, Betreff und Klartext', async () => {
  await mitProtokoll(({ protokoll }) => {
    protokoll.schreibe(GILDE, {
      art: 'a', gruppe: GRUPPE.NACHRICHTEN, ergebnis: ERGEBNIS.ERFOLG,
      akteur: { id: '1', name: 'Bert' }, betreff: '#allgemein',
    });
    protokoll.schreibe(GILDE, {
      art: 'b', gruppe: GRUPPE.NACHRICHTEN, ergebnis: ERGEBNIS.FEHLER,
      akteur: AKTEUR, klartext: 'Empfänger nimmt keine Direktnachrichten an',
    });

    assert.deepEqual(protokoll.lies(GILDE, { suche: 'bert' }).eintraege.map((e) => e.art), ['a']);
    assert.deepEqual(protokoll.lies(GILDE, { suche: 'allgemein' }).eintraege.map((e) => e.art), ['a']);
    assert.deepEqual(protokoll.lies(GILDE, { suche: 'Direktnachrichten' }).eintraege.map((e) => e.art), ['b']);
  });
});

test('die Suche unterscheidet keine Gross- und Kleinschreibung', async () => {
  await mitProtokoll(({ protokoll }) => {
    protokoll.schreibe(GILDE, {
      art: 'a', gruppe: GRUPPE.NACHRICHTEN, ergebnis: ERGEBNIS.ERFOLG, akteur: AKTEUR,
    });

    assert.equal(protokoll.lies(GILDE, { suche: 'ANNA' }).eintraege.length, 1);
  });
});

test('ein Prozentzeichen im Suchbegriff findet nicht plötzlich alles', async () => {
  await mitProtokoll(({ protokoll }) => {
    protokoll.schreibe(GILDE, { art: 'a', gruppe: GRUPPE.NACHRICHTEN, ergebnis: ERGEBNIS.ERFOLG, akteur: AKTEUR });

    assert.equal(protokoll.lies(GILDE, { suche: '%' }).eintraege.length, 0);
  });
});

test('es werden 50 Einträge je Seite ausgegeben, mit Gesamtzahl', async () => {
  await mitProtokoll(({ protokoll }) => {
    for (let i = 0; i < 120; i += 1) {
      protokoll.schreibe(GILDE, { art: `e${i}`, gruppe: GRUPPE.NACHRICHTEN, ergebnis: ERGEBNIS.ERFOLG });
    }

    const ersteSeite = protokoll.lies(GILDE, { seite: 1 });
    assert.equal(ersteSeite.eintraege.length, 50);
    assert.equal(ersteSeite.gesamt, 120);
    assert.equal(ersteSeite.seiten, 3);

    assert.equal(protokoll.lies(GILDE, { seite: 3 }).eintraege.length, 20);
  });
});

test('eine Seitenzahl jenseits des Endes zeigt die letzte Seite statt einer Sackgasse', async () => {
  await mitProtokoll(({ protokoll }) => {
    for (let i = 0; i < 60; i += 1) {
      protokoll.schreibe(GILDE, { art: `e${i}`, gruppe: GRUPPE.NACHRICHTEN, ergebnis: ERGEBNIS.ERFOLG });
    }

    // Wer eine Seite als Lesezeichen hat und danach Einträge löscht, landet
    // sonst auf einer leeren Seite ohne Hinweis, was los ist.
    const jenseits = protokoll.lies(GILDE, { seite: 99 });
    assert.equal(jenseits.seite, 2);
    assert.equal(jenseits.eintraege.length, 10);
  });
});

test('unbrauchbare Seitenzahlen führen auf die erste Seite, nicht in einen Fehler', async () => {
  await mitProtokoll(({ protokoll }) => {
    protokoll.schreibe(GILDE, { art: 'a', gruppe: GRUPPE.NACHRICHTEN, ergebnis: ERGEBNIS.ERFOLG });

    for (const seite of [0, -3, 'abc', undefined]) {
      assert.equal(protokoll.lies(GILDE, { seite }).seite, 1, `seite=${seite}`);
    }
  });
});

test('die letzten Vorgänge lassen sich einzeln abfragen', async () => {
  await mitProtokoll(({ protokoll }) => {
    for (let i = 0; i < 8; i += 1) {
      protokoll.schreibe(GILDE, { art: `e${i}`, gruppe: GRUPPE.NACHRICHTEN, ergebnis: ERGEBNIS.ERFOLG });
    }

    assert.equal(protokoll.letzte(GILDE, 5).length, 5);
  });
});

test('ein Geheimnis landet nicht im Protokoll, auch wenn jemand es mitgibt', async () => {
  await mitProtokoll(({ db, protokoll }) => {
    protokoll.schreibe(GILDE, {
      art: 'a', gruppe: GRUPPE.ANMELDUNGEN, ergebnis: ERGEBNIS.ERFOLG,
      daten: { token: 'MTIzNDU2.geheim.wert', name: 'Anna' },
    });

    const roh = JSON.stringify(db.prepare('SELECT daten FROM protokoll').all());
    assert.ok(!roh.includes('MTIzNDU2.geheim.wert'), 'Der Token steht in der Tabelle');
    assert.ok(roh.includes('Anna'), 'Harmlose Daten wurden mitmaskiert');
  });
});

test('eine unbekannte Gruppe wird nicht gespeichert, sondern abgelehnt', async () => {
  await mitProtokoll(({ protokoll }) => {
    assert.throws(() =>
      protokoll.schreibe(GILDE, { art: 'a', gruppe: 'erfunden', ergebnis: ERGEBNIS.ERFOLG }),
    );
  });
});
