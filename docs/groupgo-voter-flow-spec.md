# GroupGo — Voter Flow Specification
> Handoff documentation for implementation. All states are mocked in `groupgo-voter-flow.jsx`.
> Last updated to reflect all 25 screens.

---

## Overview

GroupGo is a mobile-first group movie voting app. The voter flow covers everything from receiving an invite link through submitting a vote and viewing results. The host/admin flow (creating polls, setting windows, managing movies) is a separate flow not covered here.

**Key principles:**
- Voters join via invite link + PIN. No account creation required.
- Polls are only published after the host has added movies — voters never see an empty movie list.
- The voting window is set by the host. The countdown is visible to voters in the app header.
- Previous selections are preserved if a voter opts out and rejoins.

---

## Screen Inventory (25 screens)

| # | Screen ID | Description |
|---|-----------|-------------|
| 1 | `secure-entry` | PIN entry, initial join screen |
| 2 | `secure-entry-wrong-pin` | PIN entry with inline error state |
| 3 | `preview-mode` | Browsing movies without joining |
| 4 | `zero-yes-preview` | Joined but 0 movies voted Yes |
| 5 | `active-voting` | Joined, ≥1 movie voted Yes |
| 6 | `countdown-normal` | Active voting, poll window visible (>24hrs remaining) |
| 7 | `countdown-urgent` | Active voting, <24hrs remaining — red urgent state |
| 8 | `change-vote` | Re-editing a previously submitted vote |
| 9 | `trailer-expanded` | Movie card with inline trailer player open |
| 10 | `flexible-mode` | Showtimes tab, flexible toggle off |
| 11 | `flexible-mode-on` | Showtimes tab, flexible toggle on |
| 12 | `leave-confirm` | Opt out confirmation bottom sheet |
| 13 | `opted-out` | Post-opt-out state, grey banner + Rejoin CTA |
| 14 | `toast-no-movie` | Submit tapped with 0 Yes votes |
| 15 | `toast-no-showtime` | Submit tapped with movies but no showtimes confirmed |
| 16 | `toast-both-missing` | Submit tapped with nothing selected |
| 17 | `showtimes-submitted` | Showtimes tab after vote submitted (read-only) |
| 18 | `results-no-votes` | Results tab, nobody has voted yet |
| 19 | `results-others-voted` | Results tab, others voted but current user has not |
| 20 | `results-all-voted` | Results tab, all members have voted |
| 21 | `results-review` | Results tab, current user has voted |
| 22 | `results-preview` | Results tab, user is in preview mode (not joined) |
| 23 | `results-poll-closed` | Poll closed, winner declared, Official Plan card |
| 24 | `no-active-poll` | No open poll exists, empty state |
| 25 | `vote-submitted` | Movies tab after submitting — locked, read-only |

---

## App Shell

### AppHeader
Persistent on all screens except `secure-entry` and `no-active-poll`.

```
GroupGo [VOTE]                    [Sam]
Perkins Family Movie Night
⏱ Voting closes in 3 days, 4 hrs   ← countdown line, conditional
```

| Prop | Type | Description |
|------|------|-------------|
| `subtitle` | string | Poll name (e.g. "Perkins Family Movie Night") |
| `countdown` | string | Third line when present (e.g. "Voting closes in 3 days, 4 hrs") |
| `countdownUrgent` | boolean | Turns countdown line red + bold when true |
| `showBack` | boolean | Shows back arrow |

**Countdown urgency threshold:** Turns red when < 24 hours remaining.

**Urgent state** also injects a red nudge card at the top of the scroll area:
> "Voting closes soon — Finish your picks and submit before the window closes."

---

### Progress Bar
4-segment binary fill bar. Below AppHeader on all screens except `secure-entry`, `no-active-poll`, and `results-poll-closed`.

| Segment | Label | Fills when |
|---------|-------|------------|
| 1 | JOINED | User has joined (always filled once joined) |
| 2 | MOVIE | ≥1 movie voted Yes |
| 3 | SHOWTIME | ≥1 showtime confirmed OR flexible toggle on |
| 4 | SUBMITTED | Vote submitted |

No partial fill — each segment is either amber (complete) or dim (not yet). Labels render below each segment in small caps.

---

### Participation Banner
Between ProgressBar and content on all screens except `secure-entry`, `no-active-poll`, and `results-poll-closed`.

is_editing — local React state only, set to true when "Change Vote" is clicked, reset to false on Resubmit. Never persisted to the server.

| State | Color | Left content | Right actions |
|-------|-------|--------------|---------------|
| Not joined | Blue | `● Preview Mode` | `[Join]` |
| Joined, voting | Green | `● Voting` | `[Submit] [Opt Out]` |
| Joined, editing | Amber | `✏️ Editing your vote` | `[Resubmit] [Opt Out]` |
| Submitted | Green | `✅ Submitted` | `[Change Vote] [Opt Out]` |
| Opted out | Grey/muted | `● You opted out` | `[Rejoin]` |

Opt Out button: ghost style — `background: rgba(0,0,0,0.25)`, `color: textMuted`, `border: rgba(255,255,255,0.15)`. Intentionally de-emphasized.

**Submit is always tappable.** Validation happens on tap. See Toast section.

---

### Tab Bar
Persistent on all screens except `secure-entry`. Three tabs: Movies · Showtimes · Results.

| Tab | Locked when | Badge |
|-----|-------------|-------|
| Movies | Never | Count of Yes votes cast |
| Showtimes | 0 movies voted Yes | Count of showtimes confirmed |
| Results | Never | No badge |

Badge is always visible. `0` = dim grey. `≥1` = solid amber with black text.

---

## Participation States

### Secure Entry (`secure-entry`)
- No app shell (no header, no tab bar, no progress bar)
- Poll name, date, 4-digit PIN keypad
- CTAs: **Join as Voter** (disabled until 4 digits entered) · **Preview Without Voting**
- Footer: "🔒 End-to-end encrypted · invite-only"

### Wrong PIN (`secure-entry-wrong-pin`)
- All 4 PIN dots filled red
- Inline error: "Incorrect PIN. Please try again."
- Join button remains disabled

### Preview Mode (`preview-mode`)
- Blue participation banner
- Movies in info-only mode (no Yes/No, Watch Trailer available)
- Results tab shows live standings — no MY PICK tags, no filter pills

### Opted Out (`opted-out`)
- Grey banner: "● You opted out · [Rejoin]"
- Info card explaining they can still browse and rejoin
- Movies at 60% opacity, info-only
- **Previous selections preserved** — votes restore on rejoin

### Opt Out Confirmation (`leave-confirm`)
- Bottom sheet overlay
- Copy: **"Your votes will be saved. Rejoin anytime with the same invite link and PIN."**
- "Yes, opt out" (red) · "Cancel — stay in" (ghost)

### Rejoin
- Tapping [Rejoin] returns user directly to active voting with saved selections
- No additional confirmation screen needed

---

## Movie Voting

### Movie Card Modes

| Mode | Yes/No buttons | Watch Trailer |
|------|---------------|---------------|
| `info` | Hidden | Visible |
| `voting` | Visible, active | Visible |
| `readonly` | Visible, dimmed | Visible |
| `results` | Hidden | Hidden |

### Vote States (3-state)
- **Yes** — green button highlighted
- **No** — red button highlighted
- **Abstain** — neither selected (default)

**Abstain ≠ No.** Prevents false negatives from incomplete voting.

### Zero Yes Preview (`zero-yes-preview`)
- Hint card: "Vote Yes on at least one movie to unlock Showtimes"
- Yes/No buttons rendered but dimmed (`canVote=false`)
- Showtimes tab locked, badge shows 0

### Trailer Expanded (`trailer-expanded`)
- Card expands inline with 16:9 player area
- "Close trailer" pill top-right of expanded card
- Yes/No buttons gain subtitles: **"Keep it in the running"** / **"Rule it out"**
- Expanded card gets amber border

### Change Vote (`change-vote`)
- Participation banner: amber "✏️ Editing your vote" + [Resubmit] [Opt Out]
- Amber info card: "Editing — your previous vote is still active until you resubmit."
- Previous selections pre-populated

---

## Showtimes

### Gate Logic
Showtimes tab locked until ≥1 movie voted Yes.

### Opt-In Model
- Default = unavailable
- Tap ✓ to confirm times that work
- Unmarked = not available

### Flexible Toggle
"I'm In — Whatever You Choose!" skips showtime voting.
- Counts as ≥1 showtime — progress bar segment 3 fills
- Badge increments to 1 when toggled on

### Showtimes Submitted (`showtimes-submitted`)
- Your confirmed times: green ✓ border, full opacity
- Other showtimes: 🔒 icon, 50% opacity, not tappable

---

## Validation (Toast)

| Condition | Message |
|-----------|---------|
| 0 Yes movies AND 0 showtimes | "Pick at least one movie and one showtime before submitting." |
| 0 Yes movies | "Vote Yes on at least one movie before submitting." |
| Has Yes movies, 0 showtimes | "Confirm at least one showtime before submitting." |

Toast renders as first item inside scroll content (not floating). Amber border, ⚠️ icon. Auto-dismiss after 3s in production.

---

## Results

### State Matrix

| Screen | MY PICK tags | Filter pills | Primary action |
|--------|--------------|--------------|----------------|
| `results-no-votes` | No | No | Submit (if joined) |
| `results-others-voted` | No | No | "Go Vote Now →" CTA |
| `results-review` | Yes | All / My Picks | Change Vote |
| `results-all-voted` | Yes | All / My Picks | Get Tickets for #1 |
| `results-preview` | No | No | "Join to Vote" |
| `results-poll-closed` | Yes | No | Get Tickets (winner card) |

### Results List
- Ranked by member vote count
- Each entry: rank badge, thumb, title, time, theater, voter count (X/5), avatar pills, fill bar
- Bar colors: amber for #1, green for MY PICK, dim for others
- MY PICK = green top ribbon, persists regardless of filter

### Group Progress Collapsible
- Results tab only, default collapsed
- Voted = colored avatar + ✓, Pending = dim + "pending"

---

## Poll Closed States

### Results — Poll Closed (`results-poll-closed`)

No participation banner, no Submit, no Opt Out. Layout top to bottom:

1. AppHeader (no countdown)
2. Progress bar step 4
3. Amber closed banner: "🏆 Poll closed · Winner decided · [date]"
4. **Context card** — poll name + "This poll is closed, standings reflect the final locked outcome." + "🎟 Get Tickets →"
5. **🏆 OFFICIAL PLAN card** — movie thumb, title, date, time (amber), theater, seat/price info, Website / Location / Directions links
6. **Group progress collapsible** — all members shown as voted ✓
7. **Your choices** — "X selected" label + "These are only the movie-and-showtime combinations you explicitly selected with Yes" + MY PICK cards
8. **Final standings** — runners-up at 65% opacity

### No Active Poll (`no-active-poll`)
- No progress bar, no participation banner
- Centered: 🍿 icon, "No Active Poll", "The last poll has been closed. Check results below."
- "View Final Results →" primary CTA
- Tab bar present

---

## Design Tokens

```js
const C = {
  bg:          "#0A0A0F",   // page background
  surface:     "#111118",   // header, tab bar, status strips
  card:        "#16161F",   // cards
  border:      "#1E1E2E",   // default borders
  borderLight: "#2A2A3E",   // subtle borders
  accent:      "#E8A020",   // amber — primary CTA, progress, badges, #1
  accentDim:   "#7A5510",   // amber backgrounds
  green:       "#22C55E",   // submitted, Yes, confirmed, MY PICK
  greenDim:    "#14532D",   // green backgrounds
  red:         "#EF4444",   // No votes, errors, urgent
  redDim:      "#450A0A",   // red backgrounds
  blue:        "#3B82F6",   // preview mode
  blueDim:     "#1E3A5F",   // blue backgrounds
  text:        "#F0EEE8",   // primary text
  textMuted:   "#7A7A8E",   // secondary text
  textDim:     "#4A4A5E",   // tertiary / disabled
  locked:      "#2A2A3E",   // locked elements
};
```

---

## Component Reference

| Component | Key props | Notes |
|-----------|-----------|-------|
| `AppHeader` | `subtitle`, `countdown`, `countdownUrgent`, `showBack` | Countdown is optional third line |
| `ProgressBar` | `step` (0–4) | Binary fill, 4 labeled segments |
| `ParticipationBanner` | `joined`, `submitted`, `onSubmit` | Drives color + CTA set |
| `TabBar` | `active`, `locked[]`, `movieCount`, `showtimeCount` | Badge always visible |
| `MovieCard` | `movie`, `mode`, `voted`, `canVote` | 4 modes |
| `Toast` | `message` | Inline, first item in scroll content |
| `ScrollArea` | `children` | Requires `minHeight: 0` for flex shrink |
| `CTAButton` | `label`, `variant`, `disabled`, `small` | primary / secondary |
| `LeaveConfirmDialog` | — | Absolute overlay, no props |
| `PhoneFrame` | `label`, `children` | Mockup wrapper — do not ship |

**Phone frame:** 390 × 844pt (iPhone 14). Font: DM Sans. ScrollArea must have `minHeight: 0` — critical for tab bar and toast to always be visible.

---

## State Machine

```
Invite link received
  └─ Secure Entry
       ├─ Wrong PIN → retry (red state, same screen)
       ├─ Preview Without Voting → Preview Mode (blue banner)
       │    └─ [Join] → Active Voting
       └─ Join as Voter + correct PIN → Zero Yes Preview
            └─ Vote ≥1 Yes → Active Voting
                 ├─ Countdown in header (always when window set)
                 │    └─ <24hrs → Urgent (red + nudge card)
                 ├─ [Opt Out] → Opt Out Confirm
                 │    ├─ Cancel → Active Voting
                 │    └─ Confirm → Opted Out (votes preserved)
                 │         └─ [Rejoin] → Active Voting (votes restored)
                 ├─ Tap Watch Trailer → Trailer Expanded (inline)
                 ├─ Showtimes tab (if ≥1 Yes) → Showtimes
                 │    └─ Toggle Flexible → Flexible On
                 └─ [Submit] (always tappable, validated on tap)
                      ├─ 0 Yes → Toast
                      ├─ 0 Showtimes → Toast
                      ├─ Both missing → Toast
                      └─ Valid → Vote Submitted
                           ├─ Movies tab → locked cards
                           ├─ Showtimes tab → read-only
                           ├─ Results tab → Results Review
                           └─ [Change Vote] → Change Vote / Editing
                                └─ [Resubmit] → Vote Submitted

Results Tab (any time after joining)
  ├─ No votes yet
  ├─ Others voted, you have not → nudge card
  ├─ You voted → MY PICK + filter
  ├─ All members voted → celebration card
  └─ Preview mode → standings only, Join CTA

Poll window closes (host action)
  └─ Results — Poll Closed
       ├─ Official Plan card (winner + logistics + links)
       ├─ Your choices (MY PICK cards)
       └─ Final standings (dimmed runners-up)

No poll open → No Active Poll empty state
```

---

## Out of Scope (Voter Flow)

**Host/admin flow (separate):**
- Poll creation and configuration
- Adding/editing movies
- Setting the voting window
- Inviting members, generating PIN
- Closing the poll and declaring a winner
- Setting the Official Plan details

**System-layer (engineering):**
- Push notifications
- Deep link re-entry handling
- Network error / offline states
- Host-cancelled poll mid-vote
- Ticket purchasing (Get Tickets links out to external)
- Account creation (voters are PIN-only)
