# Research: mobile-money payouts for Prizes and bounties, LigdiCash and the UEMOA legal frame

Resolves #225 (map #218). Status: research note, not a decision and not legal advice. Date: 2026-10-17.

## Question

What can LigdiCash do for collection, payouts and escrow, at what cost, in which countries and with which operators
(Orange Money, Wave, MTN)? Which licences, KYC and UEMOA/BCEAO or national rules apply to a platform that pays out
Bounties and Prizes? What scope is feasible if the platform never holds funds?

Legend: **[V]** read in the cited primary source during this research; **[U]** unverified, from a secondary source or
general knowledge, check before relying on it. Primary sources are the LigdiCash developer docs and site, and BCEAO
texts. Press coverage is only used to locate texts and is marked [U] whenever the text itself was not read.

## Answer in brief

1. **Collection and payout exist; escrow does not.** LigdiCash documents pay-in (redirect and direct), two payout
   modes and a merchant account split into one sub-account per operator. It documents no escrow, hold-and-release or
   per-beneficiary segregation. [V]
2. **Fees are not public.** They are negotiated per operator and per transaction type in the contract. Any figure
   (a blog says 2 to 3.5 %, settlement T+1 to T+3) is [U].
3. **Moving other people's money is a regulated payment service in the UEMOA.** Collecting from Organizers and paying
   winners would be a "transfert de fonds" under BCEAO Instruction 001-01-2024, which requires an agrément as
   payment institution (100 million FCFA minimum capital), or to act as a registered agent of one. Neither
   LigdiCash nor CodeSphere's own status could be confirmed. [V for the rule, U for LigdiCash's status]
4. **Feasible without holding funds:** (A) show Prizes and have the Organizer pay winners off-platform (what the data
   model already does), or (B) at most, let each Organizer use its own LigdiCash merchant account, with the platform
   only recording state. (B) has an open regulatory question (see below). Pooled collection by CodeSphere (C) is not
   recommended before a licensed partner or a legal opinion exists.

## LigdiCash capabilities

| Capability | What the docs say | Source |
|---|---|---|
| Pay-in with redirect | Checkout invoice, client picks the operator on LigdiCash's page | [payin-redirect](https://developers.ligdicash.com/api-paiement/payin-redirect/introduction.md) [V] |
| Pay-in without redirect | Merchant collects the number and OTP, four validation modes by operator | [payin-sans-redirect](https://developers.ligdicash.com/api-paiement/payin-sans-redirect/introduction.md) [V] |
| Payout to LigdiCash wallet | `/withdrawal/create`, recipient must hold a LigdiCash account | [checklist](https://developers.ligdicash.com/guides/checklist-production.md) [V] |
| Payout to mobile money | `/straight/payout`, no recipient account needed, not instant | [FAQ](https://developers.ligdicash.com/ressources/faq.md), [cas d'usage](https://developers.ligdicash.com/api-paiement/payout/cas-usage.md) [V] |
| Merchant account | One sub-account per activated operator; balance readable only in the Dashboard (no balance API); withdrawal to bank or mobile money by Cashout request or Dashboard | [compte marchand](https://developers.ligdicash.com/concepts/compte-marchand.md) [V] |
| Escrow / séquestre | Not mentioned in the merchant-account page, the FAQ or the payout pages | same pages [V that it is undocumented; U whether it exists commercially] |
| Visa/Mastercard/AmEx | Separate optional add-on with its own contract | [checklist](https://developers.ligdicash.com/guides/checklist-production.md) [V] |

### Payout prerequisites and constraints [V]

From the [payout introduction](https://developers.ligdicash.com/api-paiement/payout/introduction.md) and
[merchant payout page](https://developers.ligdicash.com/api-paiement/payout/vers-mobile-money.md):

- Payout must be activated on the API project, and server IPs must be whitelisted by LigdiCash (contact is on the page).
- The operator sub-account matching the recipient's number must hold enough balance, otherwise the payout fails.
  Other sub-accounts do not cover it. So a Prize payout to a Wave number needs funds already collected through Wave.
- Fees from the contract always apply, "y compris les remboursements", so the beneficiary may receive less than the
  amount sent.
- No payout minimum, maximum or operator list is documented. The documented use cases include "Distribution de gains
  et cashback" and "paiement d'agents et de prestataires", which map onto Prizes and bounties.
- Amounts are integer XOF. Confirm completion only on a callback with `status: "completed"`.

The local `ligdicash-integration` skill matches these docs on endpoints and statuses. Prefer the live docs when they differ.

### Onboarding and KYC [V]

[ligdicash.com/api-et-tarifs](https://ligdicash.com/api-et-tarifs): contact the team, complete KYC, negotiate rates,
sign the contract, get temporary credentials, LigdiCash validates the integration, then production credentials.
[Protocol d'intégration](https://developers.ligdicash.com/essentials/protocole-integration.md): the KYC file asks for
documents such as RCCM, IFU number and a company profile. This implies the **merchant must be a registered
legal entity**, which matters for who the contracting party is (CodeSphere or each Organizer).

### Fees [V that unpublished]

- Site and docs: rates "par opérateur, par type de transaction", agreed with the Partner Manager before signing;
  [pricing page](https://ligdicash.com/api-et-tarifs) lists no figures; settlement frequency, delay and minimum are
  "fixés dans votre contrat" ([FAQ](https://developers.ligdicash.com/ressources/faq.md)).
- [Terms of use](https://ligdicash.com/conditions-generales-utilisation) (wallet side): fees are a percentage set by
  partner agreements, agent withdrawals carry fixed fees, bill payment and top-up are free. The page contains two
  overlapping sets of terms that disagree in places, so treat it as indicative.
- [U] Kolonell blog (June 2026) quotes 2 to 3.5 % and T+1 to T+3. Third party, no source. Ask LigdiCash for the grid.

### Countries and operators [V]

Source: [operateurs-supportes](https://developers.ligdicash.com/reference/operateurs-supportes.md). Nine countries.
The page lists **pay-in** operators only. It does not say which operators support payout.

| Country | Operators | In UEMOA |
|---|---|---|
| Benin | Moov Africa, MTN | yes |
| Burkina Faso | Orange Money, Moov Africa | yes |
| Cote d'Ivoire | Orange Money, Moov Africa, MTN | yes |
| Mali | Orange Money | yes |
| Niger | Airtel, Zamani (Orange), Moov Africa | yes |
| Senegal | Orange Money, **Wave**, Free | yes |
| Togo | Moov Africa, YAS (Mixx) | yes |
| Guinea Conakry | Orange Money, MTN | no |
| DR Congo | Orange Money, Vodacom (M-Pesa), Airtel, Africell | no |

Asked operators: **Wave** is Senegal only. **MTN** is Benin, Cote d'Ivoire and Guinea. **Orange Money** is in Burkina,
Cote d'Ivoire, Guinea, Mali, DRC, Senegal. Minimum per transaction is 10 to 200 XOF depending on operator, maximum
depends on each operator contract. UEMOA membership of the countries is general knowledge, consistent with the
country list in the BCEAO payment-institution communique below.

## Legal frame

### 1. Electronic money: Instruction 008-05-2015, amended by Instruction 020 (8 Oct 2026)

Source: [Instruction 008-05-2015](https://www.bceao.int/sites/default/files/2017-11/instruction_no008_05_2015_intranet.pdf)
(text read) and [Instruction 020](https://www.bceao.int/fr/reglementations/instruction-ndeg-020-portant-modification-de-linstruction-ndeg-008-05-2015-du-21)
(scanned PDF, read as an image).

- Only banks, financial payment institutions and agreed e-money institutions (EME), plus authorised microfinance
  systems, may issue e-money. Everyone else needs prior BCEAO agrément (art. 8). EME: SA or multi-person SARL, head
  office in the UMOA, 300 million FCFA capital (art. 9 to 11). [V]
- Technical partners may only do technical processing or distribution under the issuer's responsibility. Issuance
  cannot be outsourced (art. 4). [V]
- Distributors (art. 17) are legal or natural persons, registered in the RCCM, who sell and load e-money, cash in/out
  and process payments on behalf of the issuer, under contract. The issuer stays liable for them and must have them
  apply AML/CFT rules (art. 18). [V]
- Holders must be identified with a valid official document before a wallet opens (art. 27). Without identification,
  total e-money made available is capped at 200,000 FCFA per month (art. 31). [V]
- Customer balances are held in a dedicated account at a bank or SFD, reconciled daily, and cannot finance the
  issuer's operations (art. 32). [V]
- **Ceilings.** Art. 31 in 2015: balance 2 million FCFA, monthly reload 10 million FCFA. Instruction 020, art. 31 new:
  **4 million FCFA balance and 15 million FCFA monthly reload, from 2 November 2026**, with prior BCEAO authorisation
  to exceed. Ceilings do not apply to distributors or acceptors acting professionally. Art. 34 new: at least 65 % of
  the float in sight deposits. [V, read on the signed instruction]
- Consequence for Prizes: a winner needs an **identified** wallet to receive more than 200,000 FCFA per month, and
  the amount must fit under the issuer's ceilings unless the winner is a professional acceptor. [V rule, applied by us]

### 2. Payment services: Instruction 001-01-2024

Source: [Instruction 001-01-2024](https://www.bceao.int/sites/default/files/inline-files/Instruction-No001-01-2024_relative_aux_services_de_paiement_dans_l-UMOA.pdf) (text read). [V]

- Payment services (art. 4) include cash in/out and account management, transfers and direct debits, card payments,
  **"les opérations de transfert de fonds"**, payments by any communication means, instrument issuance, **acquisition
  of payment operations**, payment initiation and account information.
- Nobody may provide services i) to vii) without agrément and listing as payment institution (art. 9). Services
  i) to vi) need **100 million FCFA** minimum paid-up capital; payment initiation alone 20 million; account information
  alone 10 million (registration, not agrément) (art. 11).
- Institutions must hold client funds identified separately, and deposit funds not remitted by the end of the next
  business day into ring-fenced "comptes de cantonnement", reconciled daily, protected from the institution's
  creditors (art. 48).
- A payment institution can use registered **agents** (art. 38): the BCEAO registers each agent, the institution stays
  liable (art. 39).
- Calling oneself a payment institution without agrément is forbidden (art. 9).
- The transition period for existing players ended in 2025 (extended several times, last date reported as 31 Aug
  2025). [U] The exact final date comes from press only, the BCEAO notice PDF was a scan not read.
- Status check: the [BCEAO list at 15 Sep 2025](https://www.bceao.int/fr/communique-presse/liste-des-etablissements-de-paiement-agrees-dans-lumoa-au-15-septembre-2025)
  has 30 payment institutions. **LigdiCash is not in it** (Burkina: INTOUCH Burkina, KERRY Payments Burkina). That does
  not prove it is unlicensed: it may operate under an issuer, as a bank or EME partner, or as a technical partner
  (Instruction 008, art. 4), and a later list may exist. Its terms of use name no licence or regulator. [U] Ask
  LigdiCash for its licence, regulator and the legal entity that holds the funds.

### 3. Not covered by a primary source in this research [U]

- AML/CFT: the UMOA uniform AML/CFT law applies to regulated entities. The text was not read here. Instructions 001
  and 008 both refer to AML/CFT duties for institutions and agents. Whether a platform that only initiates payments is
  itself an obliged entity is a legal question.
- National rules: in the UEMOA the BCEAO texts apply across the 8 states. **Guinea and DR Congo are outside the
  UEMOA**: central-bank rules there (BCRG, BCC) were not researched. Out-of-union transfers must respect the foreign
  financial relations regulation (Instruction 008, art. 6) [V], details not researched.
- Tax on prizes and bounties (withholding, declarations) and gambling/lottery qualification of prize contests: not
  researched, likely per-country.
- Personal data of beneficiaries (phone numbers, identity): see [gdpr-african-laws.md](gdpr-african-laws.md).

## Scope options for CodeSphere

| Option | Funds | Needs | Verdict |
|---|---|---|---|
| A. Display only: Organizer pays winners itself, platform records Prize, amount, conditions, status | none | nothing regulated | Feasible now. Matches the existing Prize entity. |
| B. Organizer-owned merchant account: each Organizer contracts LigdiCash (KYC, RCCM, IFU), CodeSphere calls the API with the Organizer's credentials to trigger payouts and track callbacks | CodeSphere never holds funds, Organizer's sub-account funds payouts | per-Organizer contract, IP whitelist, funded sub-account per operator | Plausible, **but** whether initiating payouts for a third party is a payment initiation service (agrément, 20 million FCFA) or just a technical service is [U]. Needs a written answer from LigdiCash and a lawyer before building. |
| C. CodeSphere merchant account collects from Organizers and pays winners | CodeSphere's account pools third-party money | agrément or being an agent of a licensed institution, or a licensed escrow partner | Not feasible as a first step. No escrow product documented, balance is per operator and not segregated by Organizer. |

Practical consequences if B or C is ever built:

- Payout only works from the recipient operator's sub-account, so mixed-operator winners require pre-funding every
  operator, and there is no balance API to check it.
- Fees come out of the amount, so Prize "amount and conditions" should state gross versus net.
- Winners need an identified wallet in a covered country. Wave is Senegal only, so a Burkinabe winner is Orange or
  Moov. Guinea and DRC are outside the BCEAO frame.

## Open questions to ask

To LigdiCash: licence and regulator, who holds merchant balances (and where), does a per-Organizer sub-merchant or
escrow/hold product exist, fee grid by operator for pay-in and payout, payout operator list per country, settlement
terms, whether a platform can trigger payouts for third-party merchants.
To a lawyer or the BCEAO (via LigdiCash or a local counsel): is option B a payment initiation service, is the platform
an obliged entity under the AML/CFT law, tax treatment of prizes per country.

## Sources

- LigdiCash developer docs, index [llms.txt](https://developers.ligdicash.com/llms.txt), pages cited inline. Fetched 2026-10-17.
- LigdiCash site: [api-et-tarifs](https://ligdicash.com/api-et-tarifs), [CGU](https://ligdicash.com/conditions-generales-utilisation), [home](https://ligdicash.com).
- BCEAO: Instruction 008-05-2015, Instruction 020 (08 Oct 2026), Instruction 001-01-2024, list of payment institutions at 15 Sep 2025 (links above).
- Secondary, [U]: [Financial Afrik on Instruction 020](https://www.financialafrik.com/2026/10/09/umoa-la-bceao-double-le-plafond-des-avoirs-en-monnaie-electronique-a-4-millions-de-fcfa/) (confirms the figures, which were then checked on the signed text); [Kolonell on LigdiCash fees](https://kolonell.com/fr/blog/ligdicash-burkina-faso-paiement-orange-moov-ouagadougou-2026); press on the Instruction 001-01-2024 deadline extensions.
