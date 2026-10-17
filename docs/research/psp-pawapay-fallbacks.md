# Research: pawaPay as primary PSP and fallback aggregators for mobile-money payouts

Resolves #229 (map #218). Status: research note, not a decision and not legal advice. Date: 2026-10-17.
Builds on [mobile-money-legal.md](mobile-money-legal.md) (branch `research/mobile-money-legal`, issue #225): the BCEAO
frame (agrément, 100 million FCFA, cantonnement, agents) is not redone here.

## Question

pawaPay is the intended primary PSP. What are its real capabilities (collection, payouts, countries and operators,
published fees, settlement, webhooks, sandbox, regulatory status, who holds funds)? Same survey for candidate fallback
aggregators (Flutterwave, CinetPay, Paystack, LigdiCash, others), with coverage gaps per country.

Legend: **[V]** read in the cited primary source (official docs or site) during this research; **[U]** unverified:
secondary source, page not readable, or absent from the docs. Fetched 2026-10-17. Pages were read through a
summarising fetcher, so figures are as reported by that tool; re-check any number before it enters a contract or a
budget.

## Answer in brief

1. **pawaPay covers the core need on paper: collection, payout, refund, remittance, bulk payout, hosted checkout,
   sandbox, signed callbacks.** [V] It is a direct-to-operator API, not an escrow product.
2. **Coverage in the LigdiCash countries has holes.** In the pawaPay docs: Benin, Burkina Faso, Cote d'Ivoire and
   Senegal are covered; **Mali, Niger, Togo and Guinea are not in the provider list**. [V] The marketing site contradicts
   the docs on Mali (listed as a country, but the fee page has "No items found"). [V that they conflict]
3. **Burkina Faso Orange is deposit-only**: no payout on Orange Burkina, only Moov. [V] Wave is Senegal and Cote
   d'Ivoire only. [V]
4. **Fees are published, which LigdiCash's are not.** Standard plan: 1 % pawaPay + the operator's fee on collections
   and on payouts, no setup or monthly fee. Examples 1.5 to 3.3 % total. [V]
5. **Payouts are paid from a pre-funded pawaPay wallet** that the merchant tops up by bank/SWIFT transfer. pawaPay
   holds the balance until settlement. The legal entity that holds it, and its BCEAO status, are **not stated**. [V that
   unstated; U for status]
6. **No aggregator read covers Mali, Niger and Togo with confirmed payouts.** PayDunya lists operators there (collection
   side) but payouts, fees and licence are undocumented in what could be read. CinetPay could not be read at source and
   carries a 2025 solvency incident (press). Flutterwave payouts cover only Cote d'Ivoire and Senegal in this region.
7. **Recommendation for the map, not a decision:** pawaPay primary for Cote d'Ivoire, Senegal, Benin, Burkina (Moov
   only for payout). A fallback is only needed for Mali/Niger/Togo and for Orange Burkina payout; PayDunya and LigdiCash
   are the only candidates with documented operators there, both need a direct question on payout and licence.
8. **Babimo (added at the user's request)**: an Ivorian start-up (2021, brand B-Pay) listing 8 live countries incl. Mali,
   Togo, Guinea, Ghana, with Orange/MTN/Moov/Wave and 1.5 % cash-in / 2 % + 100 cash-out published. But its site shows
   **no payout API, no webhooks, no sandbox, no docs, no legal entity, no licence number, no funds-holder**. [V that
   absent] High counterparty risk; not a payout fallback until it answers. See the Babimo section and the PSP-factory
   section for routing gaps.

## pawaPay

### Capabilities [V]

| Capability | What the docs say | Source |
|---|---|---|
| Deposits (collection) | Initiate, check status, resend callback; fees deducted from the collected amount after completion | [docs index](https://docs.pawapay.io/llms.txt), [pricing summary](https://pawapay.io/fees) |
| Payouts | Funds moved from the merchant's country wallet to the customer's wallet; amount reserved at initiation, fee taken on success, funds returned on failure; usually a few seconds, customer gets an SMS | [payouts](https://docs.pawapay.io/v2/docs/payouts.md) |
| Bulk payouts | Endpoint exists (initiate bulk payout) plus Dashboard batch disbursements | [llms.txt](https://docs.pawapay.io/llms.txt) |
| Enqueued payouts | If provider status is `DELAYED`, payouts are queued as `ENQUEUED` and can be cancelled while not `PROCESSING`; if `CLOSED`, rejected | [payouts](https://docs.pawapay.io/v2/docs/payouts.md) |
| Refunds, remittances | Own endpoints and callbacks | [llms.txt](https://docs.pawapay.io/llms.txt) |
| Hosted UI | Payment Page and Checkouts (widget tracking a payment intent) | [welcome](https://docs.pawapay.io/) |
| Name lookup, provider prediction | `NAME_LOOKUP` operation type, "Predict Provider" endpoint from an MSISDN | [active configuration](https://docs.pawapay.io/v2/api-reference/toolkit/active-configuration.md), [providers](https://docs.pawapay.io/v2/docs/providers.md) |
| Limits | Per provider `minAmount`/`maxAmount` and decimals via the Active Configuration endpoint; wallets also have daily/weekly/monthly caps, so an accepted transaction can still fail | [what_to_know](https://docs.pawapay.io/v2/docs/what_to_know.md) |

### Countries and providers (v2 docs provider table) [V]

Source: [providers](https://docs.pawapay.io/v2/docs/providers.md). The table does not state per-operation support; use
the Active Configuration endpoint with `operationType=PAYOUT` for the account's real list.

| Country | Providers (code, currency) | Notes |
|---|---|---|
| Benin | MTN (`MTN_MOMO_BEN`), Moov (`MOOV_BEN`), XOF | Celtiis exists but is Enterprise-only, betting merchants only ([plans](https://www.pawapay.io/plans)) |
| Burkina Faso | Moov (`MOOV_BFA`), Orange (`ORANGE_BFA`, PREAUTH), XOF | **Orange: no payout** (fees page "Not available"; sandbox numbers deposit-only) |
| Cote d'Ivoire | MTN, Orange, Moov (fee table), **Wave** (`WAVE_CIV`, REDIRECT_AUTH), XOF | Orange CIV marked "coming soon" Enterprise-only on the plans page, but listed with a fee line on the fees page: conflicting, confirm |
| Senegal | Free (`FREE_SEN`), Orange, **Wave** (`WAVE_SEN`), XOF | The fee page lists YAS (Mixx) instead of Free |
| Mali, Niger, Togo, Guinea | **not in the provider table** | Mali: homepage lists it among 22/23 countries, fee page empty. Togo/Niger: not seen anywhere. [V that absent from docs; U whether live on request] |
| Others | Cameroon, DRC, Ethiopia, Gabon, Ghana, Kenya, Lesotho, Malawi, Mozambique, Nigeria, Rep. Congo, Rwanda, Sierra Leone, Tanzania, Uganda, Zambia, Zimbabwe | Out of the first-market scope |

Ghana requires a locally registered entity to go live ([fees](https://pawapay.io/fees)). Several operators need a
sales contact before launch (same page).

### Published fees [V]

Sources: [plans](https://www.pawapay.io/plans), [fees](https://pawapay.io/fees). Standard plan is pay-per-transaction,
"no setup or monthly fees". pawaPay's own fee is 1 % on collections, payouts, refunds and remittances, on top of the
operator's fee, exclusive of taxes. Enterprise is custom. Headline rates (total = operator + 1 %):

| Country / operator | Collection | Payout |
|---|---|---|
| Benin MTN | 2.2 % | 1.5 % |
| Burkina Moov | 3 % | 2 % |
| Burkina Orange | 3.3 % | not available |
| Cote d'Ivoire MTN | 1.8 % | 1.3 % |
| Cote d'Ivoire Orange | 2.5 % | 2 % |
| Cote d'Ivoire Moov | 1.8 % | 1.5 % |
| Cote d'Ivoire Wave | 2 % | 2 % |
| Senegal Orange | 2 % | 1.8 % |
| Senegal Wave | 2 % | 2 % |
| Senegal YAS (Mixx) | 2 % | 1.5 % |

The page says tiered structures exist; only headline figures were read, and the last ~16k characters of the fee page
were not read. Payout rate of 1.3 to 2 % is the figure that matters for Prizes. Operators in "gaming and betting" pay
different fees: if a prize contest is qualified as gaming in some country this changes the price. [U whether it applies]

### Settlement and who holds funds

- **Merchant wallet.** Payouts draw on a pre-funded wallet per country. Top up by bank/SWIFT transfer from a bank account
  the company owns, by wallet-to-wallet, or via a "Liquidity Partner" approved by Treasury; a merchant code goes in the
  transfer reference. Timing varies by country. [V] ([topping up](https://docs.pawapay.io/dashboard/topping_up.md))
- **Who holds the money.** The Dashboard shows "the PawaPay bank account for each market". The docs do **not** name the
  legal entity that receives or holds funds, nor any trust or safeguarding arrangement. [V that unstated]
- **Settlement out.** Funds stay in wallets until settled; weekly, bi-weekly or monthly, always on a Monday; wallets
  below the minimum balance or total under 50 USD (local account) / 100 USD (cross-border) are skipped; cross-border
  accounts take EUR, USD or GBP; XOF accounts can also take XAF, CDF, USD; bank fees are deducted. [V]
  ([settlements](https://docs.pawapay.io/dashboard/finances/settlements.md)) The plans page states a separate SLA:
  local T+2 to T+11 business days, cross-border T+3 to T+12. [V] The two statements are not reconciled in the sources.
- **Relevance.** Collect-and-payout inside one country wallet never needs settlement, but the Organizer's money
  sits in a pawaPay wallet in between. That is the "holding third-party funds" question of the legal note.

### Webhooks [V]

Source: [what_to_know](https://docs.pawapay.io/v2/docs/what_to_know.md), [signatures](https://docs.pawapay.io/v2/docs/signatures.md).

- Callbacks sent on final status to a URL set in the Dashboard; one for each of deposit, payout, refund, remittance,
  checkout, statement. Retried up to 8 times over about 25 minutes; endpoint must return 200, accept POST, valid TLS;
  10 s connect, 30 s response timeouts.
- Resend within 90 days; afterwards poll the status endpoints. Handlers must be idempotent.
- Optional signing (RFC 9421 style: `Signature`, `Signature-Input`, `Content-Digest`), public keys via an endpoint.
  Platform IPs can be allowlisted; the addresses themselves are not on the page.

### Sandbox and go-live [V]

Sandbox access at signup, no onboarding needed, separate dashboard and token; production after onboarding (use case,
markets, KYC questionnaire per the plans page); only base URL and token differ. Sandbox uses fixed test MSISDNs per
provider/operation returning COMPLETED, FAILED or SUBMITTED ([test numbers](https://docs.pawapay.io/v2/docs/test_numbers.md)).
**Wave is not in the test-number list**, so Wave flows cannot be rehearsed with test numbers as read. Orange Burkina
is deposit-only there. Sources: [how to start](https://docs.pawapay.io/v2/docs/how_to_start.md),
[going live](https://docs.pawapay.io/v2/docs/going_live.md).

### Regulatory status

- Operating entity named on the site: **PawaPay UK Limited** (Milton Keynes, England). Kenya: **Quidexplus Kenya
  Limited**, "authorised as a Payment Service Provider by the Central Bank of Kenya". [V] ([homepage](https://www.pawapay.io))
- No BCEAO agrément, no licence for any UEMOA country, no safeguarding statement found in the docs or on the pages
  read. [V that not stated; **U whether it operates under local licensed partners**]. The BCEAO page for the 15 Sep 2025
  list gives only counts per country (30 institutions) and no names, so it cannot confirm or exclude pawaPay.
  ([BCEAO](https://www.bceao.int/fr/communique-presse/liste-des-etablissements-de-paiement-agrees-dans-lumoa-au-15-septembre-2025))
- Footer links Terms, Merchant Terms of Service, AML & CTF policy and a "Prohibited Business Activity" list: **not
  read** and likely to decide whether a prize/bounty platform is accepted. [U]

## Fallback aggregators

### LigdiCash (from #225, not redone)

Nine countries, pay-in operators only documented, payout operator list undocumented, fees negotiated and unpublished,
no escrow. See [mobile-money-legal.md](mobile-money-legal.md). Reaches Mali (Orange), Niger (Airtel, Zamani, Moov),
Togo (Moov, YAS) which pawaPay's docs do not.

### Flutterwave [V for lists below]

- **Payouts** ([mobile money transfers](https://developer.flutterwave.com/docs/mobile-money)): Cote d'Ivoire (Moov, MTN,
  Orange, Wave), Senegal (Orange Money, Wave), Cameroon, Ghana, Kenya, Rwanda, Uganda, Zambia. **No Burkina, Mali,
  Benin, Togo, Niger.** Integer amounts; status starts `NEW`; webhook or poll.
- **Collection** ([francophone mobile money](https://developer.flutterwave.com/v3.0/docs/francophone)): Burkina (Orange
  Money, Mobicash), Cote d'Ivoire (MTN, Orange, Moov, Wave), Senegal (Orange, Wave), Cameroon. Orange Burkina needs a USSD
  `authorization_code`; Orange Senegal push flow ended 5 Dec 2025 (QR flow); Wave must not open in an embedded WebView.
  Test mode auto-completes.
- **Fees:** the pricing page read only exposes Nigeria (local collections 2 %, transfers NGN 10/25/50). No XOF figures
  could be read. [U for XOF]
- **Licence / settlement / funds holder:** not read. [U]

### CinetPay [U, official site and docs unreachable]

`cinetpay.com` returned 403 and `docs.cinetpay.com` did not resolve from this environment, so nothing below comes from
CinetPay itself.

- [TechCabal, 1 Feb 2026](https://techcabal.com/fr/2026/02/01/cinetpay-cyberattack/) [U, press]: Ivorian processor, "more
  than 25,000" businesses, five West African countries; collection fees 2.5 to 3.5 %, payout fees 1.2 to 2 %, settlement
  within two days; reportedly BCEAO-approved in September 2025; an alleged cyberattack in September 2025 (Cote
  d'Ivoire, Togo, Burkina) and unpaid merchant/partner balances above 655 million FCFA (about 1.2 million USD) months
  later; a Senegalese investigation opened August 2025 (CinetPay denies wrongdoing).
- Consequence: treat as **high counterparty risk** until a primary source shows funds are settled and safeguarded.
  A [docs page](https://docs.cinetpay.com/api/1.0-en/BO/virer-fond) exists for transfers per search results but was not read.

### Paystack [U]

Official pages returned 403. Only unofficial pages and a search summary were available: Ghana and Kenya mobile
money, Cote d'Ivoire as a market. Nothing indicates Burkina, Senegal, Mali, Benin or Togo. Not a fit for the target
region as far as known; no figure kept. [U]

### PayDunya [partly V]

Source: [PayDunya developer docs](https://developers.paydunya.com/doc/FR/introduction) [V for the list]. Operator
codes listed: Senegal (Orange, Wave, Free, Expresso, Wizall, Djamo), Benin (MTN, Moov, Celtiis Cash), Cote d'Ivoire (Orange,
Wave, MTN, Moov, Djamo), Togo (T-Money, Moov), Mali (Orange, Moov), Burkina (Orange, Moov), Cameroon (MTN). Sandbox with
fictive accounts and an IPN (webhook) exist. A "disbursement" API (PUSH) is mentioned with no detail. Fees, settlement,
licence and funds holder: not found (the pricing URL tried returned 404). [U] This is the widest operator list for
Mali/Togo/Benin/Burkina of the candidates read, **for collection**; payout operators per country are unknown.

### Babimo [V for what the site says, U for everything it omits]

**Identification.** The name matches one company with reasonable confidence: **Babimo (brand B-Pay / "BPay")**, an Ivorian
fintech based in Abidjan, founded 2021 by El Mehdi Messek, with consumer app, merchant dashboard and an "API paiement"
([babimo.com](https://babimo.com); [We Are Tech Africa, 30 Oct 2023](https://www.wearetech.africa/fr/fils/solutions/cote-d-ivoire-babimo-utilise-le-code-qr-pour-democratiser-les-paiements-sans-contact) [U, press]).
No other PSP of that name was found; the user should confirm this is the intended one. The site footer gives only
"Babimo (B-Pay)", **no legal entity name, no registration number**. [V that unstated] Crunchbase returned 403.

| Item | What the official site says | Status |
|---|---|---|
| What it is | "Plateforme fintech qui centralise vos paiements mobiles": dashboard, payment links, QR payments, deposits/transfers/withdrawals, consumer app. Press describes it as a start-up app (QR bill payment, wallet top-up), i.e. closer to a wallet/merchant app than to an aggregator | [V site] ([home](https://babimo.com)) |
| Countries (page `pays-disponibles`) | "Disponible": Cote d'Ivoire (Orange, MTN, Moov), Senegal (Orange, **Wave**), Burkina (Orange, Moov), Guinea (Orange, MTN), Mali (Orange, Moov), Benin (MTN, Moov), Togo (TMoney, Moov), Ghana (MTN, Vodafone). "Bientot": Cameroon, DRC, Uganda. "Planifie": Kenya, Tanzania, Zambia. Home claims "10+ pays" while the page shows 8 live | [V site] ([countries](https://babimo.com/pays-disponibles)) |
| Niger | Not listed | [V absent] |
| Collection | "Parcours d'encaissement", status tracking, payment links, QR, cash-in "instant" | [V site] ([API](https://babimo.com/api-paiement), [tarifs](https://babimo.com/tarifs)) |
| Payout / disbursement | **Not mentioned on the API page.** The fee table has "Cash-Out (withdrawal)" and P2P and bank transfer, which read as end-user wallet features. No bulk or API payout described. Per-country payout support not stated | [V that undocumented; U whether an API payout exists] |
| Published fees (FCFA) | Cash-In 1.5 % + 50; Cash-Out 2 % + 100 (1-2 min, daily cap 1,000,000); P2P 0.5 %; QR 1 %; bank transfer 2.5 % + 200 (24-48 h). Home page says "1.5 % de frais". No monthly fee. The two pages are not reconciled, and no per-operator or merchant-volume grid | [V site] ([tarifs](https://babimo.com/tarifs)) |
| Settlement to merchant | Not stated (only a "delai" per service) | [V that unstated] |
| Webhooks, sandbox, SDK, docs | **None described**; no documentation link, no auth method, no developer portal. "14-day free trial" on the dashboard | [V that absent from the site; U whether they exist on request] |
| Regulatory | Badges "Conforme BCEAO" and, on the home page, "Certifie PCI DSS" (the security page does not repeat PCI DSS). KYC "conforme aux directives BCEAO". **No licence number, no regulator, no named partner bank** | [V that claimed; U that true] |
| BCEAO list | A search for Babimo/B-Pay against the BCEAO payment-institution communications returned no mention. The lists were not readable as names (counts only), so this neither confirms nor excludes a licence | [U] |
| Who holds funds | Not addressed. Only "works with mobile-money leaders and financial institutions" | [V that unstated] |
| Press fees (consumer) | 25,000 FCFA top-up: 625 operator fee + 125 reload fee | [U, press, 2023] |

**Counterparty risk: high / unknown.** Young company (2021), accelerator and hackathon background, no legal entity, no
licence evidence, no funds-holding statement, no developer documentation, no status page. It is the only candidate
besides LigdiCash that lists Mali, Togo and Burkina on paper, but nothing shows it can **pay out** through an API.
Treat it as a possible collection or marketing-grade fallback to be qualified, not as a payout rail, until it answers
the questions below.

### Wave Business API and Hub2 [partly V]

- [Wave](https://docs.wave.com/business) [V]: Checkout sessions API, Bearer key bound to one business wallet, HMAC
  signing, IP whitelist. Payout API, countries and fees are on other pages not read. A direct Wave integration only
  adds value over pawaPay for Wave-specific pricing. [U]
- [Hub2](https://docs.hub2.io) [V]: has pay-in and Transfer (pay-out) APIs for mobile money, banks, cards; countries,
  fees, licence not on the page read. [U]

## Coverage matrix (first-market countries)

Reading: P = payout documented in the cited docs, C = collection only documented, - = no evidence, ? = unverified.
Babimo "listed" means operators named on its countries page; payout is undocumented everywhere, so it is shown as L.

| Country | pawaPay | Flutterwave | PayDunya | LigdiCash | Babimo (L = listed, payout ?) | CinetPay |
|---|---|---|---|---|---|---|
| Senegal | Orange P, Wave P, Free/YAS P | Orange P+C, Wave P+C | C: Orange, Wave, Free; payout ? | C: Orange, Wave, Free | L: Orange, Wave | ? (U) |
| Cote d'Ivoire | MTN, Orange, Moov, Wave P | MTN, Orange, Moov, Wave P+C | C all four; payout ? | C: Orange, Moov, MTN | L: Orange, MTN, Moov (no Wave) | ? (U) |
| Burkina Faso | Moov P; Orange **C only** | Orange C (payout -) | C: Orange, Moov; payout ? | C: Orange, Moov | L: Orange, Moov | ? (U) |
| Benin | MTN, Moov P (fee table: MTN) | - | C: MTN, Moov, Celtiis | C: Moov, MTN | L: MTN, Moov | ? (U) |
| Mali | **-** (site lists, no fee table) | - | C: Orange, Moov; payout ? | C: Orange | L: Orange, Moov | ? (U) |
| Togo | **-** | - | C: T-Money, Moov | C: Moov, YAS | L: TMoney, Moov | ? (U) |
| Niger | **-** | - | - | C: Airtel, Zamani, Moov | - | ? (U) |
| Guinea (non-UEMOA) | **-** | - | - | C: Orange, MTN | L: Orange, MTN | ? (U) |

Gaps to cover with a second PSP, given pawaPay as primary: **Mali, Niger, Togo** (all payouts), **Orange Burkina payout**,
and **Guinea**. Nobody read has confirmed payouts in those places. Babimo widens the *listed* coverage to Mali, Togo and
Guinea but with no payout evidence, no licence evidence and no API documentation; **Niger stays uncovered by every
candidate** except LigdiCash (collection side).

## Fit with a "PSP factory" (routing by country, zone, operator)

Design assumption, not a decision: a `PspAdapter` interface (`collect`, `payout`, `status`, `verifyWebhook`) with a
router that picks an adapter from `(country, operator, operation)`, a capability table loaded from config, and a fallback
list per key. Zone = UEMOA/XOF versus Guinea (GNF), because wallets, currencies and the BCEAO frame differ.

| Key (country / operator / op) | Primary | Fallback candidates | Fallback status |
|---|---|---|---|
| CI / MTN, Orange, Moov, Wave / payout | pawaPay | Flutterwave (P documented) | **Real fallback** |
| SN / Orange, Wave / payout | pawaPay | Flutterwave (P documented) | **Real fallback** |
| SN / Free (YAS) / payout | pawaPay | none documented | Gap |
| BF / Moov / payout | pawaPay | PayDunya, Babimo, LigdiCash (payout ?) | Unconfirmed |
| BF / Orange / payout | **none** (pawaPay deposit-only) | PayDunya, Babimo, LigdiCash (payout ?) | Gap until a payout is confirmed |
| BJ / MTN, Moov / payout | pawaPay | PayDunya, Babimo, LigdiCash (payout ?) | Unconfirmed |
| ML / Orange, Moov | **none** | PayDunya, Babimo, LigdiCash (payout ?) | Primary and fallback both unconfirmed |
| TG / Moov, TMoney, YAS | **none** | PayDunya, Babimo, LigdiCash (payout ?) | Primary and fallback both unconfirmed |
| NE / any | **none** | LigdiCash (collection side only) | Gap |
| GN / Orange, MTN | **none** | Babimo, LigdiCash (payout ?) | Gap |
| Collection, any listed country | pawaPay (CI/SN/BF/BJ) | Flutterwave (CI/SN/BF), PayDunya, LigdiCash, Babimo | Collection has more cover than payout |

Observations. (1) Only CI and SN have a documented payout fallback (Flutterwave). (2) Everywhere else the second
adapter is a *candidate* whose payout capability is unproven; build the capability table with a `verified` flag so the
router never falls back to an adapter whose payout was not tested in sandbox or with a real small transfer. (3) A
fallback is only safe if wallets are pre-funded at both PSPs (payouts draw on a balance), which doubles float and
makes the "who holds the money" question apply to each PSP. (4) Adapters differ in webhook signing (pawaPay RFC 9421,
Wave HMAC, Babimo none documented) and in idempotency, so the factory needs per-adapter verification and a common
internal payment id. (5) Operator-level routing needs MSISDN to operator prediction (pawaPay has a Predict Provider
endpoint); other PSPs would need it done in-house.

## Open questions to ask

pawaPay: is Mali/Togo/Niger live on request and when; which legal entity holds merchant wallet funds, where, and under
which licence in UEMOA states; is a marketplace paying third parties allowed under "Prohibited Business Activity" and the
Merchant ToS; real min/max per payout provider; Wave payout availability and sandbox; the wallet top-up lead time for
XOF.
PayDunya and LigdiCash: licence and regulator, payout operators per country, fee grid, settlement terms, who holds balances.
Flutterwave: XOF fees and whether Burkina/Mali/Benin/Togo payouts exist.
CinetPay: current settlement status after the 2025 incident, written proof of BCEAO agrément.
Babimo: confirm this is the intended company and its legal entity; licence number and regulator (is "Conforme BCEAO" an
agrément or a partner's cover); who holds merchant balances and in which bank; is there an API payout / disbursement
(bulk, per country and operator), API documentation, auth, sandbox, webhooks and signing; merchant fee grid and
settlement time; PCI DSS certificate (claimed on the home page only); Niger plans; Wave payout availability.

## Sources

- pawaPay: [docs index](https://docs.pawapay.io/llms.txt), [providers](https://docs.pawapay.io/v2/docs/providers.md),
  [payouts](https://docs.pawapay.io/v2/docs/payouts.md), [what to know](https://docs.pawapay.io/v2/docs/what_to_know.md),
  [signatures](https://docs.pawapay.io/v2/docs/signatures.md), [settlements](https://docs.pawapay.io/dashboard/finances/settlements.md),
  [topping up](https://docs.pawapay.io/dashboard/topping_up.md), [test numbers](https://docs.pawapay.io/v2/docs/test_numbers.md),
  [active configuration](https://docs.pawapay.io/v2/api-reference/toolkit/active-configuration.md),
  [how to start](https://docs.pawapay.io/v2/docs/how_to_start.md), [going live](https://docs.pawapay.io/v2/docs/going_live.md),
  [plans](https://www.pawapay.io/plans), [fees](https://pawapay.io/fees), [homepage](https://www.pawapay.io). Fetched 2026-10-17.
- Flutterwave: [mobile money transfers](https://developer.flutterwave.com/docs/mobile-money), [francophone](https://developer.flutterwave.com/v3.0/docs/francophone), [pricing](https://flutterwave.com/ng/pricing).
- PayDunya: [introduction](https://developers.paydunya.com/doc/FR/introduction). Wave: [business API](https://docs.wave.com/business). Hub2: [docs](https://docs.hub2.io).
- BCEAO: [list at 15 Sep 2025](https://www.bceao.int/fr/communique-presse/liste-des-etablissements-de-paiement-agrees-dans-lumoa-au-15-septembre-2025) (counts only).
- Babimo (added 2026-10-17): [home](https://babimo.com), [countries](https://babimo.com/pays-disponibles), [tarifs](https://babimo.com/tarifs),
  [API](https://babimo.com/api-paiement), [securite](https://babimo.com/securite), [FAQ](https://babimo.com/faq). Secondary [U]:
  [We Are Tech Africa](https://www.wearetech.africa/fr/fils/solutions/cote-d-ivoire-babimo-utilise-le-code-qr-pour-democratiser-les-paiements-sans-contact). Crunchbase 403.
- Secondary [U]: [TechCabal on CinetPay](https://techcabal.com/fr/2026/02/01/cinetpay-cyberattack/). Not reachable: cinetpay.com, docs.cinetpay.com, paystack.com (403/DNS).
