import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bestimmeStufe, reichtAus, STUFE } from '../../src/auth/rechte.mjs';

const OWNER = '4242';

/** Zuordnung Rolle → Stufe, wie sie aus der Zugriffstabelle käme. */
function zuordnung(karte) {
  return (rollenIds) => {
    let beste;
    for (const id of rollenIds) {
      const stufe = karte[id];
      if (!stufe) continue;
      if (!beste || rang(stufe) > rang(beste)) beste = stufe;
    }
    return beste;
  };
}
const rang = (s) => ['KEIN_ZUGRIFF', 'BETRACHTER', 'MODERATOR', 'OWNER'].indexOf(s);

test('die Owner-ID aus der Konfiguration ergibt immer die höchste Stufe', () => {
  const stufe = bestimmeStufe({
    discordUserId: OWNER,
    ownerId: OWNER,
    rollenIds: [],
    stufeFuerRollen: zuordnung({}),
  });

  assert.equal(stufe, STUFE.OWNER);
});

test('der Owner bleibt Owner, auch wenn eine Rolle ihn niedriger einstuft', () => {
  const stufe = bestimmeStufe({
    discordUserId: OWNER,
    ownerId: OWNER,
    rollenIds: ['555'],
    stufeFuerRollen: zuordnung({ 555: STUFE.BETRACHTER }),
  });

  assert.equal(stufe, STUFE.OWNER, 'Der Owner kann sich selbst aussperren');
});

test('eine zugeordnete Rolle ergibt ihre Stufe', () => {
  const stufe = bestimmeStufe({
    discordUserId: '9999',
    ownerId: OWNER,
    rollenIds: ['555'],
    stufeFuerRollen: zuordnung({ 555: STUFE.MODERATOR }),
  });

  assert.equal(stufe, STUFE.MODERATOR);
});

test('bei mehreren zugeordneten Rollen gewinnt die höhere Stufe', () => {
  const stufe = bestimmeStufe({
    discordUserId: '9999',
    ownerId: OWNER,
    rollenIds: ['555', '666'],
    stufeFuerRollen: zuordnung({ 555: STUFE.BETRACHTER, 666: STUFE.MODERATOR }),
  });

  assert.equal(stufe, STUFE.MODERATOR);
});

test('wer keine zugeordnete Rolle hat, ist ausgesperrt', () => {
  const stufe = bestimmeStufe({
    discordUserId: '9999',
    ownerId: OWNER,
    rollenIds: ['777'],
    stufeFuerRollen: zuordnung({ 555: STUFE.MODERATOR }),
  });

  assert.equal(stufe, STUFE.KEIN_ZUGRIFF);
});

test('wer gar keine Rollen hat, ist ausgesperrt', () => {
  assert.equal(
    bestimmeStufe({
      discordUserId: '9999',
      ownerId: OWNER,
      rollenIds: [],
      stufeFuerRollen: zuordnung({ 555: STUFE.MODERATOR }),
    }),
    STUFE.KEIN_ZUGRIFF,
  );
});

test('wer nicht Mitglied des Servers ist, ist ausgesperrt', () => {
  assert.equal(
    bestimmeStufe({
      discordUserId: '9999',
      ownerId: OWNER,
      rollenIds: undefined,
      stufeFuerRollen: zuordnung({ 555: STUFE.MODERATOR }),
    }),
    STUFE.KEIN_ZUGRIFF,
  );
});

test('ohne erkennbares Konto gilt die Vorgabe: kein Zugriff', () => {
  const ohne = { ownerId: OWNER, rollenIds: ['555'], stufeFuerRollen: zuordnung({ 555: STUFE.OWNER }) };

  assert.equal(bestimmeStufe({ ...ohne, discordUserId: undefined }), STUFE.KEIN_ZUGRIFF);
  assert.equal(bestimmeStufe({ ...ohne, discordUserId: '' }), STUFE.KEIN_ZUGRIFF);
});

test('eine unbekannte Stufe aus der Tabelle wird nicht geglaubt', () => {
  const stufe = bestimmeStufe({
    discordUserId: '9999',
    ownerId: OWNER,
    rollenIds: ['555'],
    stufeFuerRollen: () => 'SUPERADMIN',
  });

  assert.equal(stufe, STUFE.KEIN_ZUGRIFF, 'Ein erfundener Wert wurde übernommen');
});

test('ist kein Owner konfiguriert, wird niemand versehentlich Owner', () => {
  assert.equal(
    bestimmeStufe({
      discordUserId: '9999',
      ownerId: undefined,
      rollenIds: [],
      stufeFuerRollen: zuordnung({}),
    }),
    STUFE.KEIN_ZUGRIFF,
  );
});

test('eine höhere Stufe reicht für eine niedrigere Anforderung', () => {
  assert.equal(reichtAus(STUFE.OWNER, STUFE.MODERATOR), true);
  assert.equal(reichtAus(STUFE.MODERATOR, STUFE.BETRACHTER), true);
});

test('die gleiche Stufe reicht aus', () => {
  assert.equal(reichtAus(STUFE.MODERATOR, STUFE.MODERATOR), true);
});

test('eine niedrigere Stufe reicht nicht', () => {
  assert.equal(reichtAus(STUFE.BETRACHTER, STUFE.MODERATOR), false);
  assert.equal(reichtAus(STUFE.KEIN_ZUGRIFF, STUFE.BETRACHTER), false);
});

test('unbekannte Stufen reichen nie aus', () => {
  assert.equal(reichtAus('SUPERADMIN', STUFE.BETRACHTER), false);
  assert.equal(reichtAus(undefined, STUFE.BETRACHTER), false);
  assert.equal(reichtAus(STUFE.OWNER, 'SUPERADMIN'), false);
  assert.equal(reichtAus(STUFE.OWNER, undefined), false);
});
