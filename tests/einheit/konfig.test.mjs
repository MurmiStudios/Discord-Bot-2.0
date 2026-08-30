import { test } from 'node:test';
import assert from 'node:assert/strict';
import { leseKonfig, KonfigFehler } from '../../src/kern/konfig.mjs';

/** Eine vollstaendige, gueltige Umgebung — Grundlage fuer die Abweichungen unten. */
function gueltigeUmgebung(aenderungen = {}) {
  return {
    DISCORD_TOKEN: 'MTIzNDU2Nzg5MDEyMzQ1Njc4.GaBcDe.beispielhafter-token-wert',
    DISCORD_CLIENT_ID: '123456789012345678',
    DISCORD_CLIENT_SECRET: 'geheimnis-des-clients-abcdefghijklmno',
    GUILD_ID: '987654321098765432',
    OWNER_DISCORD_ID: '111111111111111111',
    PANEL_URL: 'http://140.10.20.30:3000',
    SESSION_SECRET: 'a'.repeat(64),
    ...aenderungen,
  };
}

test('liest eine vollstaendige Umgebung und ergaenzt die Vorgabewerte', () => {
  const konfig = leseKonfig(gueltigeUmgebung(), '22.13.0');

  assert.equal(konfig.port, 3000);
  assert.equal(konfig.dmMaxEmpfaenger, 100);
  assert.equal(konfig.dmPauseMs, 1200);
  assert.equal(konfig.uploadMaxBytes, 5242880);
  assert.equal(konfig.uploadMaxKante, 4096);
  assert.equal(konfig.guildId, '987654321098765432');
});

test('eigene Werte haben Vorrang vor den Vorgaben', () => {
  const konfig = leseKonfig(
    gueltigeUmgebung({ PORT: '8080', DM_MAX_RECIPIENTS: '25', DM_DELAY_MS: '2000' }),
    '22.13.0',
  );

  assert.equal(konfig.port, 8080);
  assert.equal(konfig.dmMaxEmpfaenger, 25);
  assert.equal(konfig.dmPauseMs, 2000);
});

test('eine fehlende Pflichtvariable bricht ab und nennt ihren Namen', () => {
  const umgebung = gueltigeUmgebung();
  delete umgebung.DISCORD_TOKEN;

  assert.throws(
    () => leseKonfig(umgebung, '22.13.0'),
    (fehler) => {
      assert.ok(fehler instanceof KonfigFehler);
      assert.match(fehler.message, /DISCORD_TOKEN/);
      return true;
    },
  );
});

test('die Abbruchmeldung nennt alle fehlenden Variablen auf einmal', () => {
  const umgebung = gueltigeUmgebung();
  delete umgebung.DISCORD_TOKEN;
  delete umgebung.GUILD_ID;

  assert.throws(() => leseKonfig(umgebung, '22.13.0'), (fehler) => {
    assert.match(fehler.message, /DISCORD_TOKEN/);
    assert.match(fehler.message, /GUILD_ID/);
    return true;
  });
});

test('die Abbruchmeldung verraet nie den Wert eines Geheimnisses', () => {
  const umgebung = gueltigeUmgebung({ SESSION_SECRET: 'zu-kurz' });

  assert.throws(() => leseKonfig(umgebung, '22.13.0'), (fehler) => {
    assert.match(fehler.message, /SESSION_SECRET/);
    assert.ok(!fehler.message.includes('zu-kurz'), 'Der Wert steht in der Meldung');
    return true;
  });
});

test('HTTPS ohne TRUST_PROXY=1 bricht mit benannter Meldung ab', () => {
  const umgebung = gueltigeUmgebung({ PANEL_URL: 'https://panel.example.org' });

  assert.throws(() => leseKonfig(umgebung, '22.13.0'), (fehler) => {
    assert.match(fehler.message, /TRUST_PROXY/);
    return true;
  });
});

test('HTTPS mit TRUST_PROXY=1 ist gueltig und schaltet das Secure-Cookie ein', () => {
  const konfig = leseKonfig(
    gueltigeUmgebung({ PANEL_URL: 'https://panel.example.org', TRUST_PROXY: '1' }),
    '22.13.0',
  );

  assert.equal(konfig.sicheresCookie, true);
  assert.equal(konfig.vertraueProxy, true);
});

test('ueber HTTP bleibt das Secure-Cookie aus, denn sonst kaeme es nie an', () => {
  const konfig = leseKonfig(gueltigeUmgebung(), '22.13.0');

  assert.equal(konfig.sicheresCookie, false);
});

test('eine zu alte Node-Version bricht ab und nennt beide Versionen', () => {
  assert.throws(() => leseKonfig(gueltigeUmgebung(), '22.12.0'), (fehler) => {
    assert.match(fehler.message, /22\.12\.0/);
    assert.match(fehler.message, /22\.13/);
    return true;
  });
});

test('eine neuere Node-Version ist in Ordnung', () => {
  assert.doesNotThrow(() => leseKonfig(gueltigeUmgebung(), '24.4.1'));
});

test('eine unbrauchbare Zahl bricht ab und nennt die Variable', () => {
  assert.throws(() => leseKonfig(gueltigeUmgebung({ PORT: 'dreitausend' }), '22.13.0'), (fehler) => {
    assert.match(fehler.message, /PORT/);
    return true;
  });
});

test('eine negative Zahl wird abgelehnt', () => {
  assert.throws(() => leseKonfig(gueltigeUmgebung({ DM_DELAY_MS: '-5' }), '22.13.0'), (fehler) => {
    assert.match(fehler.message, /DM_DELAY_MS/);
    return true;
  });
});

test('eine PANEL_URL ohne Schema wird abgelehnt', () => {
  assert.throws(() => leseKonfig(gueltigeUmgebung({ PANEL_URL: '140.10.20.30:3000' }), '22.13.0'), (fehler) => {
    assert.match(fehler.message, /PANEL_URL/);
    return true;
  });
});

test('die Redirect-URI wird aus der PANEL_URL abgeleitet, ohne doppelten Schraegstrich', () => {
  const konfig = leseKonfig(gueltigeUmgebung({ PANEL_URL: 'http://140.10.20.30:3000/' }), '22.13.0');

  assert.equal(konfig.redirectUri, 'http://140.10.20.30:3000/auth/callback');
});
