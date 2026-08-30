import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { oeffneDatenbank } from '../../src/daten/db.mjs';
import { migriere, ladeMigrationen } from '../../src/daten/migrieren.mjs';
import { verlangtGildenId, GildenFehler } from '../../src/daten/repository.mjs';
import { erstelleGilden } from '../../src/daten/gilden.mjs';
import { erstelleZugriff } from '../../src/daten/zugriff.mjs';
import { mitTempVerzeichnis } from '../hilfen/db.mjs';

const EIGEN = '111111111111111111';
const FREMD = '222222222222222222';

/** Frisch migrierte Datenbank mit zwei angelegten Gilden. */
async function mitDatenbank(fn) {
  return mitTempVerzeichnis(async (dir) => {
    const db = oeffneDatenbank(join(dir, 'panel.db'));
    migriere(db, ladeMigrationen(new URL('../../src/daten/migrationen/', import.meta.url).pathname));
    const gilden = erstelleGilden(db);
    gilden.merke(EIGEN, 'Eigener Server');
    gilden.merke(FREMD, 'Fremder Server');
    try {
      return await fn({ db, gilden });
    } finally {
      db.close();
    }
  });
}

test('Migration 001 legt die vier Grundtabellen an', async () => {
  await mitDatenbank(({ db }) => {
    const tabellen = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all()
      .map((z) => z.name);

    for (const erwartet of ['gilden', 'sitzungen', 'zugriff', 'protokoll']) {
      assert.ok(tabellen.includes(erwartet), `Tabelle ${erwartet} fehlt`);
    }
  });
});

test('jede fachliche Tabelle traegt eine guild_id', async () => {
  await mitDatenbank(({ db }) => {
    for (const tabelle of ['sitzungen', 'zugriff', 'protokoll']) {
      const spalten = db.prepare(`PRAGMA table_info(${tabelle})`).all().map((s) => s.name);
      assert.ok(spalten.includes('guild_id'), `${tabelle} hat keine guild_id`);
    }
  });
});

test('eine gemerkte Gilde laesst sich wiederfinden', async () => {
  await mitDatenbank(({ gilden }) => {
    assert.equal(gilden.finde(EIGEN).name, 'Eigener Server');
    assert.equal(gilden.finde('999999999999999999'), undefined);
  });
});

test('ein erneutes Merken aktualisiert den Namen statt zu scheitern', async () => {
  await mitDatenbank(({ gilden }) => {
    gilden.merke(EIGEN, 'Neuer Name');

    assert.equal(gilden.finde(EIGEN).name, 'Neuer Name');
    assert.equal(gilden.alle().length, 2, 'Es wurde eine zweite Zeile angelegt');
  });
});

test('eine Zugriffsregel gehoert genau einer Gilde', async () => {
  await mitDatenbank(({ db }) => {
    const zugriff = erstelleZugriff(db);
    zugriff.setze(EIGEN, '555', 'MODERATOR');

    assert.deepEqual(
      zugriff.alle(EIGEN).map((z) => z.rollenId),
      ['555'],
    );
    assert.deepEqual(zugriff.alle(FREMD), [], 'Die fremde Gilde sieht die Regel');
  });
});

test('eine Abfrage mit fremder guild_id liefert leer, nicht die Daten der anderen', async () => {
  await mitDatenbank(({ db }) => {
    const zugriff = erstelleZugriff(db);
    zugriff.setze(EIGEN, '555', 'MODERATOR');
    zugriff.setze(EIGEN, '666', 'BETRACHTER');

    assert.equal(zugriff.stufeFuerRollen(FREMD, ['555', '666']), undefined);
    assert.equal(zugriff.stufeFuerRollen(EIGEN, ['555']), 'MODERATOR');
  });
});

test('bei mehreren zutreffenden Rollen gewinnt die hoehere Stufe', async () => {
  await mitDatenbank(({ db }) => {
    const zugriff = erstelleZugriff(db);
    zugriff.setze(EIGEN, '555', 'BETRACHTER');
    zugriff.setze(EIGEN, '666', 'MODERATOR');

    assert.equal(zugriff.stufeFuerRollen(EIGEN, ['555', '666']), 'MODERATOR');
  });
});

test('das Loeschen einer Gilde nimmt ihre Zeilen mit', async () => {
  await mitDatenbank(({ db, gilden }) => {
    const zugriff = erstelleZugriff(db);
    zugriff.setze(EIGEN, '555', 'MODERATOR');
    zugriff.setze(FREMD, '777', 'MODERATOR');

    gilden.vergiss(EIGEN);

    assert.deepEqual(zugriff.alle(EIGEN), []);
    assert.equal(zugriff.alle(FREMD).length, 1, 'Die andere Gilde wurde mitgeloescht');
  });
});

test('eine fehlende Gilden-ID ist ein Programmierfehler und wird als solcher gemeldet', () => {
  assert.throws(() => verlangtGildenId(undefined), GildenFehler);
  assert.throws(() => verlangtGildenId(''), GildenFehler);
  assert.throws(() => verlangtGildenId(42), GildenFehler);
  assert.equal(verlangtGildenId(EIGEN), EIGEN);
});

test('jede Lesefunktion der Ablage verlangt die Gilden-ID', async () => {
  await mitDatenbank(({ db }) => {
    const zugriff = erstelleZugriff(db);

    assert.throws(() => zugriff.alle(undefined), GildenFehler);
    assert.throws(() => zugriff.setze(undefined, '555', 'MODERATOR'), GildenFehler);
    assert.throws(() => zugriff.stufeFuerRollen(undefined, ['555']), GildenFehler);
  });
});
