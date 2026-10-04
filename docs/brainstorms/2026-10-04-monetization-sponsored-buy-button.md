---
date: 2026-10-04
topic: monetization
status: idea — revisit once the explorer has traffic; no implementation planned yet
---

# Monetization — Sponsored Decklist Buy Button

## Summary

Assume the explorer gets real traffic. Monetize without ads: the "buy this deck"
button under every decklist is the single revenue surface. It earns affiliate
commission while nobody pays for it, and becomes an exclusive sponsorship slot
when a vendor pays a flat monthly fee to be the only name on it. Subscriptions,
API licensing, paid reports and B2B tooling were considered and rejected: this
is not data the audience would pay for directly.

---

## Decisions

- **No ads.** No banners, no networks, no impression-based anything.
- **Affiliate and sponsorship are one feature, not two.** The button exists
  because it is useful to the reader (a price and a buy/rent link). Sponsorship
  only changes who is behind it and how we get paid.
- **One partner per surface.** Exclusivity is the product. A vendor pays to keep
  the other vendor off the Modern page, not for impressions.
- **Data stays untouched and the slot is labelled.** A sponsor who asks for a
  nicer meta share is a sponsor we drop.
- **Rejected:** freemium Pro tier gated on matchups, API/data licensing, paid
  weekly report, tournament-organizer tooling, donations. Reason: audience will
  not pay for the data itself.

---

## The surface

Under each decklist (archetype page, tournament page, player-in-tournament view):

| Audience | Partner slot | Action |
| --- | --- | --- |
| Paper, Europe | one vendor (e.g. Cardmarket) | price + buy |
| Paper, US | one vendor (e.g. TCGplayer, Card Kingdom) | price + buy |
| MTGO | one bot chain (e.g. Cardhoarder, Goatbots, MTGO Traders) | tix price + buy or rent |

Rentals for MTGO leagues likely convert better than paper purchases; meta-watchers
browse, league grinders rent.

---

## Who buys the slot

- **Card vendors:** Cardmarket, TCGplayer, Card Kingdom. Card Kingdom already
  sponsors much of the content ecosystem, so the buyer role exists.
- **MTGO bot chains:** Cardhoarder, Goatbots, MTGO Traders. They sponsor
  streamers; our audience is exactly their customer.
- **Accessory brands:** Ultimate Guard, Dragon Shield. Second ring; they sponsor
  players and sites.
- **Deck tools and tournament organizers:** likely trades (links, data) rather
  than cash.

---

## Sequencing

1. **Now — affiliate.** Ship the buy button with affiliate links. Cardmarket,
   TCGplayer and Cardhoarder each run an affiliate program you apply to. Track
   clicks per vendor, format and page in PostHog. No sponsor needed.
2. **Traffic threshold — media kit.** One page built from PostHog: monthly
   uniques, country split, format split, and affiliate click counts as proof of
   purchase intent. Vendors buy on those four numbers.
3. **Then — sell the slot.** Outreach to partnerships/marketing roles at ~5
   vendors. Sponsorship tiers per region/format, monthly recurring.

The affiliate phase is what makes the sponsorship phase sellable: "readers
clicked through to buy decks N times last month" beats a traffic number alone.

---

## NanoCorp fit

Where the NanoCorp platform helps with phase 3:

- `nanocorp prospects search` — B2B contact database; partnerships and marketing
  managers at the vendors above are in it. Small LGS owners mostly are not.
- `nanocorp emails` — outreach from a hello@ address at the MetaMage domain,
  replies read in the same inbox. First batch is ~10 emails, not a blast.
- `nanocorp products` — each sponsorship tier gets a permanent checkout link,
  monthly plan for recurring. Sponsor pays by card, no invoicing.
- `nanocorp connections` — posts to X / Bluesky / Reddit from the business
  accounts; candidate replacement for the current socialbot/magebridge feed.
- `nanocorp ads` is Meta ads for *buying* traffic. Not relevant here.

For the founding PITCH, revenue is one sentence: *"Exclusive vendor sponsorship
of the decklist buy button per region, affiliate revenue until a sponsor takes
the slot."* The FLOW should include the sponsor-facing page (media kit + tiers)
as a real user journey.

---

## Open questions

- Melee data terms: a free hobby site and a sponsored site are different
  conversations. Read once before phase 3.
- Wizards Fan Content Policy and Scryfall image guidelines: sponsored data sites
  exist, so workable, but read both once.
- Which PostHog event marks a buy-button click, and does it carry vendor,
  format and page so the media kit can be generated rather than hand-built.
- Price list and decklist-to-cart deep links differ per vendor; which vendors
  support a full-deck cart URL vs. card-by-card.

## Related

- [STRATEGY.md](../../STRATEGY.md) — explorer, data backbone, shareable distribution.
- [decklist-by-type](2026-09-27-decklist-by-type-requirements.md) — the decklist
  component the button attaches to.
- [tournament-page](2026-09-27-tournament-page-requirements.md) — second surface
  for the button.
