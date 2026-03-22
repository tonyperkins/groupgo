# GroupGo: Social Platform Migration

> **Note:** This document represents historical planning. Many of the architectural items (PostgreSQL migration, universal Magic Link Auth, removal of PINs) have already been successfully implemented. For current architectural truths, see `groupgo-windsurf-handoff.md`. For future user flow strategy, see `modern-democratized-flows.md`.

## Overview

This document specifies the changes required to transform GroupGo from an
admin-managed single-group tool into a self-service social platform where any
user can organise outings, manage their own groups, and invite others.

The core shift:

| Today | After |
|---|---|
| One platform admin creates all users | Anyone can sign up |
| Admin creates and manages groups | Any user creates and owns their groups |
| Admin creates all polls | Any user creates polls for their groups or ad-hoc |
| Users are passive voters | Users are organisers, members, or guests |
| Single "admin" role | Organiser (scoped per poll/group) + platform super-admin |

*Database Scaling Decision:* The platform currently runs on SQLite. Because this migration requires dropping and recreating tables (we are pre-launch and not using Alembic), this is the perfect opportunity to eliminate future technical debt by migrating our SQLModel engine directly to **PostgreSQL**. This ensures we do not hit SQLite concurrency locks once the self-serve platform goes live.

---

## Core Concepts

### Member
A user with a full account (email + magic-link auth). Can:
- Create groups and polls
- Be permanently added to groups (auto-invited to future polls in that group)
- Have voting history and a profile

### Guest
A one-time participant invited to a specific poll. No account required. Can:
- Vote via a tokenised invite link or PIN
- Optionally upgrade to a full Member account at any point

This maps onto the existing PIN-voter flow — guests are the same low-friction
experience GroupGo already provides.

### Group
A saved roster of Members that an owner manages. Think "Friday Night Crew" or
"Book Club". Creating a poll for a group auto-invites all current members.

Currently Groups are admin-created containers. After this migration any Member
can create and own a Group. The data model already supports this; we are
removing the admin gate and adding `owner_user_id`.

### Poll (Outing)
An event-voting session created by a Member (the Organiser). The Organiser has
full management rights over their own poll: edit options, open/close, pick a
winner. Polls can be addressed to one or more Groups, to ad-hoc email
addresses, or both.

### Invitation
A single-use tokenised record that bridges a Group or Poll to someone who is
not yet a member of it. Covers both existing platform users and people who have
never heard of GroupGo. An `Invitation` handles *delivery*; upon acceptance, the appropriate authorization links are created.

---

## User Roles

| Role | Description |
|---|---|
| `member` | Default for all self-registered users. Can create groups and polls. |
| `platform_admin` | Hidden ops role. Can manage anything platform-wide. Replaces current `admin` role concept for the single operator. |

The current `role = "admin"` on `User` maps to `platform_admin` for the one or
two operator accounts. All other users become `member`. The organiser of a
specific poll or owner of a specific group gets contextual elevated rights
scoped to that object — not a platform-wide role.

---

## Data Model Changes

### New model: `Invitation`

```python
class Invitation(SQLModel, table=True):
    __tablename__ = "invitations"

    id: str = Field(primary_key=True)          # UUID token (used in email link)
    created_by_user_id: int = Field(foreign_key="users.id") # Audit trail: who sent this
    invited_email: str = Field(index=True)      # normalised lowercase, indexed for fast lookup
    invited_user_id: Optional[int] = Field(    # set if email matches existing user
        default=None, foreign_key="users.id"
    )
    target_type: str                            # "group" | "poll"
    target_id: int
    status: str = Field(default="pending")     # "pending" | "accepted" | "declined" | "expired"
    created_at: str = Field(default_factory=_now)
    expires_at: str = Field(index=True)         # 7 days for group invites, 48 h for poll invites
    accepted_at: Optional[str] = Field(default=None)

    __table_args__ = (
        # Prevent spamming the same email with multiple pending invites for the same target
        UniqueConstraint("target_type", "target_id", "invited_email", name="uq_invitation_target"),
    )
```

An invitation is consumed exactly once. On acceptance:
- If `target_type = "group"` → create `UserGroup` row and add user as Member
- If `target_type = "poll"` → create `PollGroup`/direct poll-user link and
  admit the user as a voter (guest or member depending on whether they sign up)

### Changes to existing models

**`Group`** — add `owner_user_id`:
```python
owner_user_id: Optional[int] = Field(default=None, foreign_key="users.id")
```
The owner can invite/remove members, rename the group, and delete it. Existing
groups get `owner_user_id = NULL`; the platform_admin is the effective owner for
those.

*Orphaned Groups Policy:* If an `owner_user_id` account is deleted, ownership of the group automatically transfers to the oldest remaining member. An automated email is dispatched to the remaining group members indicating the change in leadership.

**Cascade Rules:** Ensure `UserGroup` and `PollGroup` junction tables have proper `ON DELETE CASCADE` rules defined for user and group deletions to prevent orphaned records.

**Legacy FK Deprecation:** `User.group_id` and `Poll.group_id` are DEPRECATED. They map back to the single-group era. They must be removed from the models entirely in Phase 2 in favor of the `UserGroup` and `PollGroup` many-to-many tables.

**`User`** — role values change:
- `"admin"` → rename to `"platform_admin"`
- `"voter"` → rename to `"member"` (all self-registered users)
- Guest voters with no account are not rows in `users` at all — they are
  identified only by their `Invitation` token / PIN for that poll session.

**`Poll`** — no structural change needed. `created_by_user_id` already exists
and becomes the authoritative "organiser" field. Ensure this is always populated.

---

## Authentication & Session Strategy

### Magic link extended to all users

`MagicLinkToken.purpose` gains two new values:

| Purpose | Trigger | Behaviour |
|---|---|---|
| `member_signup` | New user clicks invite link or visits sign-up page | Creates account then logs in |
| `member_login` | Existing member requests login link | Logs in to existing account |
| `admin_login` | *(existing)* Platform admin login | Unchanged |
| `voter_onboard` | *(existing)* Guest voter PIN setup | Unchanged |

**Token Hygiene & Replay Protection:** `MagicLinkToken` records must have a short TTL (e.g., 15 minutes) for signup and login. The token must be immediately invalidated/deleted upon successful first use to prevent replay attacks.

### Concrete Session Mapping
The application now supports three discrete session types:
1. **Platform Admin:** Uses `gg_admin_session` cookie mapped to `AuthSession(session_type="admin")`.
2. **Member:** Uses `gg_member_session` cookie mapped to `AuthSession(session_type="member")`.
3. **Guest:** Uses URL-token or legacy `token` cookie mapped statelessly to an `Invitation.id` or existing PIN logic.

### Sign-up & Login Flow (new)
*Security Note:* Because Magic Links are now front-and-center for general use, **rate-limiting** must be applied to the `/login` and `/signup` endpoints (e.g., 5 requests per 10 minutes per IP/Email) to mitigate credential-stuffing and spam abuse.

---

## Invitation Flows

### Flow 1 — Invite to a Group (persistent membership)

> "Join my crew — you'll get auto-invited to all our future outings."

**Sender steps:**
1. Opens group management page
2. Types one or more email addresses into "Invite members" field
3. Optionally adds a personal message
4. Submits → `Invitation` rows created, invitation emails sent

**Recipient (new user):**
1. Receives email: "Tony invited you to join Friday Night Crew on GroupGo"
2. Clicks link → lands on sign-up page pre-filled with their email
3. Enters name → magic link sent → clicks link → account created
4. `UserGroup` row created → redirected to group page

**Recipient (existing member):**
1. Receives email (or in-app notification)
2. Clicks "Accept" → `UserGroup` row created → redirected to group page

**Invitation expiry:** 7 days.

---

### Flow 2 — Invite to a Specific Poll (one-off guest)

> "Just vote on this one thing — no commitment, no account needed."

**Sender steps:**
1. During poll creation (or after), types email addresses into "Invite guests"
   field (separate from the group selector)
2. Submits → `Invitation(target_type="poll")` rows created, invite emails sent

**Recipient:**
1. Receives email: "Tony wants your vote on Friday Night Movies"
2. Clicks link → lands on voting page immediately (no account required)
3. Prompted at end: "Create an account to track your votes and get future invites"

*Guest to Member Upgrades:* When a guest creates a member account, historical `Vote` records associated with their deterministic matching key (email + poll ID) are automatically merged/linked to their new `member` `user_id`.

**Invitation expiry:** 48 hours, or when the poll closes — whichever is sooner.

---

### Flow 3 — Group(s) + Ad-hoc Extras (hybrid)

> "Invite my usual crew AND a couple of new people to this specific poll."

**Sender steps during poll creation:**
1. **Step: Who's voting?**
   - Select from saved groups (multi-select — all members auto-invited)
   - Type additional email addresses in "Also invite" field
2. Submit → `PollGroup` rows created for each selected group, `Invitation`
   rows created for each ad-hoc email address, all notification/invite emails
   sent

Ad-hoc invitees go through Flow 2. Group members get a standard poll notification.

---

## Route and UI Changes

| Route | Description |
|---|---|
| `GET /` | Marketing splash for unauthenticated; redirect to `/dashboard` for logged-in. |
| `GET /signup` | Sign-up page (name + email) |
| `GET /login` | Member login page (email → magic link) |
| `GET /dashboard` | Logged-in member home: my polls + my groups |
| `GET /dashboard/polls/new` | Poll creation wizard |
| `GET /dashboard/polls/{id}` | Organiser view of a specific poll |
| `GET /dashboard/groups` | My groups list |
| `GET /dashboard/groups/new` | Create a new group |
| `GET /dashboard/groups/{id}` | Group management (members, invite, settings) |
| `GET /invites/{token}` | Invitation landing page. Gracefully handles expired/used tokens with clear messaging instead of 404s. |
| `GET /auth/member/{token}` | Magic link consumer for member login/signup |

---

## Poll Creation Wizard (New UI Flow)

Replaces the current admin-only poll creation form. Steps:

1. **Name & description** — outing title, optional description
2. **Pick dates** — date range selector (unchanged from current)
3. **Choose events** — movie/activity picker (unchanged from current)
4. **Who's voting?**
   - Multi-select from user's saved groups.
   - **Frictionless Sharing:** Hook into the native OS Share Sheet (Web Share API) allowing the organiser to quickly generate and text a generic Poll Link to friends.
   - When friends click this link, they are prompted for their email to generate the ad-hoc `Invitation` on the fly.
5. **Review & send** — summary, then submit

**Accessibility:** Ensure ARIA labels and focus management are fully implemented in this wizard so the premium UI remains accessible.

---

## Phased Implementation Plan

*Note:* We will not bother with Alembic migration scripts. We will simply drop the tables and allow SQLModel to recreate the schema in the new database.

### Phase 0 — Infrastructure Upgrade
**Goal:** Swap out SQLite for PostgreSQL before self-serve traffic hits.

1. Deploy a PostgreSQL container/database.
2. Update `app/db.py` to point the SQLModel engine to PostgreSQL.
3. Automatically recreate the new schema natively.

### Phase 1 — Self-service auth
**Goal:** Any person can create a GroupGo account without admin involvement.

1. Add `member_signup` and `member_login` to `MagicLinkToken.purpose`
2. Define a short TTL (15m) and destruction-on-use logic for Magic Links.
3. Establish Concrete Session Mapping: Add `session_type = "member"` to `AuthSession` and implement `gg_member_session` cookie alongside `gg_admin_session`.
4. Create `GET /signup` and `GET /login` pages & `GET /auth/member/{token}` endpoint.
5. **Security:** Implement token bucket rate-limiting (e.g. 5 req / 10m) on auth endpoints.
6. Update `User.role` values: `"voter"` → `"member"`, `"admin"` → `"platform_admin"`.
7. **Refactor:** Centralize role checking into a `has_role(user, role)` middleware helper to ensure consistency.
8. **Testing:** Write integration tests validating the login/signup flows against legacy admin and voter PIN checks. 

---

### Phase 2 — Democratise poll and group creation
**Goal:** Any logged-in member can create polls and groups.

1. Add `owner_user_id` to `Group`.
2. **Legacy Cleanup:** Remove `User.group_id` and `Poll.group_id` from models entirely. Update all query paths to rely on `UserGroup` and `PollGroup`.
3. Apply the `require_member` middleware guard consistently across creation endpoints.
4. **Email Foundation:** Setup generic Email HTML Templates (Base, Action Button) for scalable use in Phase 3.
5. Build `/dashboard` home page (my polls, my groups), `/dashboard/polls/new` wizard and `/dashboard/groups/new` pages.
6. Scope poll management page to `created_by_user_id`.
7. **Testing:** Write automated tests asserting users cannot view/edit groups or polls they do not own or partake in.

---

### Phase 3 — Invitation system
**Goal:** Members can invite others to their groups and polls.

1. Create `Invitation` model. Index `invited_email` and `expires_at`.
2. Group and Poll invite flows with background dispatch using Phase 2 Email Templates.
3. Integrate frictionless native OS sharing into poll creation wizard.
4. **Security:** Rate-limit the API endpoint that dispatches invites to prevent spam abuse.
5. **Background Job:** Implement a cron task to actively rotate Invitation `status` from `pending` to `expired` once `expires_at` is reached.
6. **Testing:** Integration tests for Invitation state machine (Pending -> Accepted / Declined / Expired).

---

### Phase 4 — Polish and future enhancements
**Goal:** Complete the user experience and close gaps.

1. In-app notification feed.
2. **Guest → member upgrade:** Prompt on voting completion and migrate historical votes.
3. Profile page (name, email, change settings).
4. **Zero Groups Dashboard State:** Populate empty dashboards with options to "Create Your First Group" or "Find groups my friends are in." Prototype early.

---

## Open Questions & Decisions

1. **Can a guest voter see the results page?**
   **Decision:** Yes. Return a **read-only** view that shows the final tally but hides member-only analytics (like specifically who voted for what, if that's a privacy concern).

2. **Can a member belong to zero groups?**
   **Decision:** Yes. The dashboard handles this graceful empty state by surfacing a **“Find groups”** CTA that leverages a simple search API or invites them to create one.

3. **Can a poll have zero groups?**
   **Decision:** Yes. Ensure `_get_poll_group_users` falls back to checking the `Invitation` table. Write unit tests for this specific edge case.

4. **Poll visibility:**
   **Decision:** Members can ONLY see polls they are explicitly invited to or created themselves. This must be enforced at the **Database Query level** (e.g. `WHERE poll_id IN (SELECT ... FROM poll_group) OR poll_id IN (SELECT ... FROM invitation)`) to prevent accidental leakage via raw queries.
