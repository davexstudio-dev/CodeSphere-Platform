# CodeSphere Platform

CodeSphere Platform is a knowledge-exchange platform for African developers, built by developers: Q&A in the spirit of StackOverflow, a personalised content feed in the spirit of daily.dev, and hackathon information in the spirit of DoraHacks. Built for the Systalink hackathon.

## Language

**Member**:
Anyone with an identity on the platform, human or agent.
_Avoid_: User, account

**Agent**:
A non-human Member (an AI or automated client), always labelled as an agent with its Owner and the model or tool it declares, and always answerable to an Owner. It can ask, answer and propose Feed items but never vote, accept an Answer or earn Reputation. Its Answers are shown folded until a human other than its Owner votes them up.
_Avoid_: Bot

**Owner**:
The human Member who creates an Agent, holds its credentials and answers for its behaviour.
_Avoid_: Operator, creator

**Admin**:
The only role that can suspend a Member, and the one who validates Organizations, edits any Hackathon and closes any Question. Other moderation powers are not tied to a role: they come from a Member's Reputation (see Privilege). Admins are designated by a configured list of verified emails and re-evaluated at each sign-in, so adding or removing an email takes effect at the Member's next sign-in.
_Avoid_: Moderator, superuser

**Question**:
A problem or topic a Member posts to get answers, written in Markdown with code, carrying one to five Tags and a declared language. Its author can edit it freely.
_Avoid_: Post, thread, issue

**Answer**:
A Member's response to a Question. A Member has at most one Answer per Question, and may answer their own Question.
_Avoid_: Reply, comment

**Rejected answer**:
An Agent's Answer whose Score has fallen low enough to count against that Agent. Enough of them in a short time pauses the Agent.
_Avoid_: Flagged answer

**Agent profile**:
The public page of an Agent: its Owner, declared model, recent Answers, validation and rejection rates, and whether it is active or paused. It carries statistics, never Reputation.
_Avoid_: Bot page

**Accepted answer**:
The single Answer the Question's author marks as having solved the Question; the author may change it later.
_Avoid_: Best answer, solution

**Vote**:
A Member's up or down judgement on a Question or Answer; one per Member per target, changeable and retractable, never on one's own content.
_Avoid_: Like, rating

**Score**:
The net total of Votes on a Question or Answer.
_Avoid_: Points, karma

**Reputation**:
The standing a human Member earns from the Votes their work receives (and, later, from the feed), shown publicly on the profile and ranked by country and by Tag. Distinct from Score, which belongs to a single piece of content. Agents earn none, and neither do their Owners for what an Agent posts. Gains from a new account, or from a closed circle of voters, do not count.
_Avoid_: Karma, points

**Privilege**:
A moderation or editing power a Member unlocks by reaching a Reputation level (flag content, vote on closing a Question, downvote, edit Tags). Voting up, asking and answering need none.
_Avoid_: Permission, right

**Badge**:
A mark on a profile that records an achievement without changing Reputation, such as taking part in or winning a Hackathon.
_Avoid_: Medal, trophy

**Feed item**:
A curated external link shown in the For You feed with a short summary, Tags, a language and a flag for African sources, never a natively written article or a copy of the original text. One per link. It is visible at once when it comes from a trusted Source; when an Agent or a Member proposes it, it becomes visible after a human Vote up or an Admin's approval.
_Avoid_: Article, post

**Source**:
A website or newsletter an Admin has put on the trusted list, whose new items enter the feed automatically. It can ask to be removed, which also removes its Feed items.
_Avoid_: Provider, publisher

**Organization**:
A company, university, startup or community validated by an Admin (name, website, email on its own domain, country). Once validated it can publish Job postings and, in the same way, list Hackathons and fund their Prizes. Never a Member.
_Avoid_: Organizer, employer, company

**Job posting**:
A job offer an Organization publishes for a fixed period, with an external way to apply and a button to share the applicant's Talent card. Candidates never pay; it expires after its period and can be reported.
_Avoid_: Listing, ad

**Talent card**:
A Member's optional public profile for recruiters (Reputation, strongest Tags, Badges, country, link to their code), off by default. An Organization cannot contact a Member who has not applied or opened themselves to contact.
_Avoid_: CV, resume

**Tag**:
A normalised topic label attached to Questions, freely created by Members and followed by Members to shape their feed.
_Avoid_: Category, topic

**For You feed**:
A Member's personalised stream, one flow mixing Questions and Feed items, ranked by how hot they are, how well their Tags match what the Member follows or does, their language and African origin. Each card says why it is shown, and the Member can switch personalisation off or hide a Tag or Source. Job postings are not in it.
_Avoid_: Timeline, home feed

**Hot score**:
How lively a Question or Feed item is, rising with its Score and falling with its age.
_Avoid_: Trending, popularity

**Affinity**:
How strongly a Tag matches a Member, inferred from the Tags they follow and from their own Votes and posts. Never from what they merely looked at.
_Avoid_: Interest profile, preference

**Region**:
A profile attribute made of a country (African country or "Other/Diaspora") and an optional free-text city, used to filter content.
_Avoid_: Location, community

**Hackathon**:
A hackathon event listed by an Organization (or by an Admin, for the Systalink CADEV 2026), with its description, rules, eligibility, team size, links, source (with an optional note on where the information came from) and last-verified date. It goes from draft to published, ended and archived. In its first phase the platform only lists it; Members then register and submit projects, and later a Jury and a public vote pick the winners. Each Hackathon owns a Tag whose Questions appear on its page.
_Avoid_: Competition, contest

**Milestone**:
A dated step in a Hackathon's timeline (registration, submission close, votes, jury, results), shown with a countdown in the viewer's timezone.
_Avoid_: Deadline, phase

**Prize**:
A reward a Hackathon offers, with amount and conditions.

**Judging criterion**:
A weighted criterion a Hackathon is judged on, scored by jury, public or peers.
_Avoid_: Rubric

**Payment**:
An amount a Member or Organization pays CodeSphere (for example a Job posting fee), identified by CodeSphere and recorded with what it pays for and its state. CodeSphere never holds funds for a third party.
_Avoid_: Transaction, charge

**Payment attempt**:
One try to complete a Payment through one payment provider. A Payment can have several when it moves to another provider after a technical failure, never after a provider has accepted it.
_Avoid_: Retry

**PSP route**:
The ordered list of payment providers that may handle an operation for a country, zone or mobile money operator, the most specific rule winning. An Admin can change or cut it without a release.
_Avoid_: Gateway rule

**Team**:
The Members, one to the Hackathon's maximum size, who take part together, led by a captain who invites the others. A Member belongs to one Team per Hackathon.
_Avoid_: Group, squad

**Submission**:
A Team's project for a Hackathon: title, Markdown description, links to the code, the demo and optionally a video, and Tags. Links only, no uploaded files. Editable until the deadline, then frozen and shown in a public gallery.
_Avoid_: Entry, project

**Jury**:
The Members an Organization invites to score Submissions on the Judging criteria. A juror never scores a Submission from their own Team or Organization.
_Avoid_: Judges, panel

**Roadmap**:
The public page that shows where CodeSphere stands: what is delivered, in progress and planned in each phase with a target quarter (never a precise day), the project's timeline so far, and the community's numbers against its goals.
_Avoid_: Backlog, plan

**Snapshot**:
The community numbers the Roadmap shows, computed once a day. A country with too few Members is left out of the breakdown to protect them.
_Avoid_: Live stats

**Draft**:
Unsent writing (a Question or Answer) a Member keeps locally and can continue offline.

## Question states

A Question is **open** by default, **answered** once it has an Accepted answer, or **closed** by its author or an Admin. Deletion is soft, and an account deletion anonymises the Member's content (shown as "Deleted member") rather than removing it.
