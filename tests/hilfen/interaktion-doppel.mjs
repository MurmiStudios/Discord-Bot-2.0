/**
 * Erfundene Discord-Interaktion. Bildet die Unterscheidungsmethoden nach, die
 * der Router benutzt, und merkt sich, was geantwortet wurde.
 */
export function erstelleInteraktion({
  art = 'button',
  customId = 'test:1',
  commandName = 'test',
  felder = {},
  benutzerId = 'm1',
} = {}) {
  const antworten = [];

  return {
    art,
    customId,
    commandName,
    user: { id: benutzerId, username: 'Anna' },
    guildId: '111111111111111111',
    isButton: () => art === 'button',
    isModalSubmit: () => art === 'modal',
    isChatInputCommand: () => art === 'befehl',
    fields: { getTextInputValue: (name) => felder[name] },
    replied: false,
    deferred: false,
    async reply(inhalt) {
      antworten.push(inhalt);
      this.replied = true;
    },
    async followUp(inhalt) {
      antworten.push(inhalt);
    },
    antworten,
  };
}
