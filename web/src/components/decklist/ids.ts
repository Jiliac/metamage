// Shared DOM ids for the Decklists tab. A plain module (no "use client", no
// imports) so the client DeckNav can read it without pulling the server-side
// DecklistView — and lib/decks, card-names — into the client bundle.

/** Anchor id the mobile pick-scroll targets (R17): DecklistView renders it,
 *  DeckNav scrolls to it. */
export const DECK_HEADER_ID = 'decklist-header'
