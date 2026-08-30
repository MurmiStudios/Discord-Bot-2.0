import { test } from 'node:test';
import assert from 'node:assert/strict';
import { erstelleRouter } from '../../src/discord/interaktion/router.mjs';
import { registriereBefehle } from '../../src/discord/interaktion/registrieren.mjs';
import { erstelleLogger } from '../../src/kern/logger.mjs';
import { erstelleInteraktion } from '../hilfen/interaktion-doppel.mjs';

function baueRouter(spuren = {}) {
  const zeilen = [];
  const logger = erstelleLogger({ schreibe: (z) => zeilen.push(z) });
  return { router: erstelleRouter({ logger, ...spuren }), zeilen };
}

test('ein Knopfdruck erreicht den passenden Umgang', async () => {
  const gesehen = [];
  const { router } = baueRouter({
    buttons: new Map([['aktion', async (interaktion) => gesehen.push(interaktion.customId)]]),
  });

  await router.verarbeite(erstelleInteraktion({ art: 'button', customId: 'aktion:42' }));

  assert.deepEqual(gesehen, ['aktion:42']);
});

test('eine ausgefüllte Rückmeldung erreicht den Umgang für Eingabefenster', async () => {
  const gesehen = [];
  const { router } = baueRouter({
    modals: new Map([['rueckmeldung', async (i) => gesehen.push(i.fields.getTextInputValue('feld1'))]]),
  });

  await router.verarbeite(
    erstelleInteraktion({ art: 'modal', customId: 'rueckmeldung:7', felder: { feld1: 'Antwort' } }),
  );

  assert.deepEqual(gesehen, ['Antwort']);
});

test('ein Slash-Befehl erreicht die dritte Spur', async () => {
  const gesehen = [];
  const { router } = baueRouter({
    befehle: new Map([['hilfe', { daten: { name: 'hilfe' }, async ausfuehren(i) { gesehen.push(i.commandName); } }]]),
  });

  await router.verarbeite(erstelleInteraktion({ art: 'befehl', commandName: 'hilfe' }));

  assert.deepEqual(gesehen, ['hilfe']);
});

test('die Spuren stören einander nicht', async () => {
  const gesehen = [];
  const { router } = baueRouter({
    buttons: new Map([['gleich', async () => gesehen.push('button')]]),
    modals: new Map([['gleich', async () => gesehen.push('modal')]]),
  });

  await router.verarbeite(erstelleInteraktion({ art: 'modal', customId: 'gleich:1' }));

  assert.deepEqual(gesehen, ['modal']);
});

test('ein unbekannter Knopf wird beantwortet statt still zu verfallen', async () => {
  const { router } = baueRouter({ buttons: new Map() });
  const interaktion = erstelleInteraktion({ art: 'button', customId: 'weg:1' });

  await router.verarbeite(interaktion);

  assert.equal(interaktion.antworten.length, 1, 'Es kam keine Antwort');
  assert.match(interaktion.antworten[0].content, /nicht mehr/i);
});

test('die Antwort auf einen unbekannten Knopf sieht nur der Klickende', async () => {
  const { router } = baueRouter({ buttons: new Map() });
  const interaktion = erstelleInteraktion({ art: 'button', customId: 'weg:1' });

  await router.verarbeite(interaktion);

  assert.ok(interaktion.antworten[0].ephemeral || interaktion.antworten[0].flags);
});

test('ein unbekannter Knopf wird protokolliert, damit man ihn findet', async () => {
  const { router, zeilen } = baueRouter({ buttons: new Map() });

  await router.verarbeite(erstelleInteraktion({ art: 'button', customId: 'weg:1' }));

  assert.ok(zeilen.some((z) => z.includes('weg:1')));
});

test('ein Fehler im Umgang stürzt nichts ab und wird dem Klickenden gemeldet', async () => {
  const { router } = baueRouter({
    buttons: new Map([['kaputt', async () => { throw new Error('ging schief'); }]]),
  });
  const interaktion = erstelleInteraktion({ art: 'button', customId: 'kaputt:1' });

  await assert.doesNotReject(() => router.verarbeite(interaktion));

  assert.equal(interaktion.antworten.length, 1);
  assert.match(interaktion.antworten[0].content, /nicht ausgeführt|schiefgegangen/i);
});

test('ein Fehler im Umgang wird mit seiner Ursache protokolliert', async () => {
  const { router, zeilen } = baueRouter({
    buttons: new Map([['kaputt', async () => { throw new Error('ging schief'); }]]),
  });

  await router.verarbeite(erstelleInteraktion({ art: 'button', customId: 'kaputt:1' }));

  assert.ok(zeilen.some((z) => z.includes('ging schief')));
});

test('eine Interaktion, die keine der drei Spuren betrifft, wird übergangen', async () => {
  const { router } = baueRouter();
  const interaktion = erstelleInteraktion({ art: 'sonstiges' });

  await assert.doesNotReject(() => router.verarbeite(interaktion));
  assert.deepEqual(interaktion.antworten, []);
});

test('der Router hängt sich an das Interaktionsereignis des Clients', async () => {
  const { router } = baueRouter({ buttons: new Map([['a', async () => {}]]) });
  const gehoert = [];
  const client = { on: (ereignis) => gehoert.push(ereignis) };

  router.registriereAn(client);

  assert.deepEqual(gehoert, ['interactionCreate']);
});

test('ohne Befehle wird bei Discord nichts angemeldet', async () => {
  const aufrufe = [];
  const zeilen = [];
  const logger = erstelleLogger({ schreibe: (z) => zeilen.push(z) });

  await registriereBefehle({
    befehle: new Map(),
    konfig: { clientId: '1', guildId: '2', token: 'x' },
    anmelden: async (daten) => aufrufe.push(daten),
    logger,
  });

  assert.deepEqual(aufrufe, [], 'Es wurde trotzdem etwas angemeldet');
  assert.ok(!zeilen.join('').match(/fehler/i), 'Der leere Fall wurde als Fehler behandelt');
});

test('vorhandene Befehle werden mit ihren Daten angemeldet', async () => {
  const aufrufe = [];

  await registriereBefehle({
    befehle: new Map([['hilfe', { daten: { name: 'hilfe', description: 'Hilfe' }, ausfuehren() {} }]]),
    konfig: { clientId: '1', guildId: '2', token: 'x' },
    anmelden: async (daten) => aufrufe.push(daten),
    logger: erstelleLogger({ schreibe: () => {} }),
  });

  assert.equal(aufrufe.length, 1);
  assert.deepEqual(aufrufe[0], [{ name: 'hilfe', description: 'Hilfe' }]);
});

test('scheitert die Anmeldung der Befehle, startet das Panel trotzdem', async () => {
  const zeilen = [];

  await assert.doesNotReject(() =>
    registriereBefehle({
      befehle: new Map([['hilfe', { daten: { name: 'hilfe' }, ausfuehren() {} }]]),
      konfig: { clientId: '1', guildId: '2', token: 'x' },
      anmelden: async () => { throw new Error('Discord antwortet nicht'); },
      logger: erstelleLogger({ schreibe: (z) => zeilen.push(z) }),
    }),
  );

  assert.ok(zeilen.some((z) => z.includes('Discord antwortet nicht')));
});
