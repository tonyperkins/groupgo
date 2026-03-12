---
title: GroupGo Voter UI State Matrix
description: Canonical UI behavior spec for Movies, Showtimes, and Results based on voter participation and voting state.
---

# GroupGo Voter UI State Matrix

## Terminology

The most useful official term for this document is:

- **State matrix**

Related terms:

- **State machine**
- **UI state model**
- **Behavior matrix**
- **Decision table**

For this project, `state matrix` is probably the clearest label because we care about:

- current user state
- derived UI state
- enabled / disabled / hidden behavior
- CTA copy
- preview vs interactive mode

## Purpose

This document defines the expected voter experience across:

- `Movies`
- `Showtimes`
- `Results`

It is intended to be the source of truth for:

- whether a section is interactive
- whether content is visible but locked
- which CTA should be shown
- which empty state should appear
- what preview mode means

## Core State Dimensions

A voter's UI behavior is derived from these inputs.

### Participation

- `not_joined`
  - user has not opted in for this poll
  - may or may not have saved historical votes

- `joined`
  - user is actively participating in this poll

- `opted_out`
  - user was participating and explicitly opted out
  - may retain saved votes
  - may have an `opt_out_reason`

###[ Movie voting progress ]

- `no_movie_votes`
- `some_movie_votes`
- `all_movies_reviewed`

### Movie selection outcome

- `no_yes_movies`
  - user has not voted `yes` on any movie
- `has_yes_movies`
  - user has at least one `yes` movie

### Showtime voting progress

- `no_showtime_votes`
- `some_showtime_votes`
- `completed_showtime_votes`

### Flexible mode

- `flexible_off`
- `flexible_on`

### Poll type

- `multi_movie_poll`
- `single_movie_poll`

## Derived UI Modes

These are the important user-facing modes.

### 1. Movies preview mode

Conditions:

- user is `not_joined`

Behavior:

- movie cards are visible
- voting controls are visible but locked
- primary CTA is `Count Me In`
- explicit opt-out CTA may be shown alongside join CTA if desired
- progression to Showtimes is disabled

### 2. Movies active voting mode

Conditions:

- user is `joined`
- not completed

Behavior:

- movie cards are interactive
- user can vote `yes` / `no`
- veto reasons available on `no`
- bottom CTA depends on completion and `yes` count

### 3. Showtimes preview mode

Conditions:

- user is `not_joined`
  or
- user is `opted_out`
  or
- user is `joined` but `no_yes_movies`

Behavior:

- showtime listings are visible
- showtime vote controls are visible but locked
- no completion CTA
- no active voting interaction
- content should still render in unified timeline format
- theater filters remain visible if useful; they should not unlock voting

### 4. Showtimes active voting mode

Conditions:

- user is `joined`
- user `has_yes_movies`
- `flexible_off`
- not completed

Behavior:

- matching showtimes are visible
- showtime vote controls are enabled
- completion CTA available
- flexible toggle enabled

### 5. Showtimes flexible mode

Conditions:

- user is `joined`
- `flexible_on`

Behavior:

- showtime list may be replaced by flexible confirmation state
- flexible toggle enabled
- user treated as available for all showtimes
- completion / done state available

### 6. Results passive mode

Conditions:

- any user state

Behavior:

- results are viewable
- personal sections vary depending on whether the user has active selections
- opted-out users are excluded from affecting group results

## State Matrix

## Movies page

| User state | Movie cards | Movie voting | CTA | Notes |
|---|---|---|---|---|
| Not joined | Visible | Disabled / locked | `Count Me In` | Preview allowed |
| Joined, not finished | Visible | Enabled | Depends on progress | Normal voting |
| Joined, all reviewed, no yes movies | Visible | Enabled | Showtimes Enabled | Text on CTA button `Preview Showtimes` |
| Joined, ready for showtimes | Visible | Enabled | `Next: Pick Showtimes` | Normal path |
| Opted out with saved votes | Visible | Disabled / non-participating | `I'm back in!` | Saved votes may still display as context |
| Completed | Visible | Disabled | `View Group Results`, `Edit my votes`, `Actually I can't make it` | Finalized but reversible |

## Showtimes page

| User state | Showtime list | Session controls | Hero / message | CTA area |
|---|---|---|---|---|
| Not joined | Visible | Disabled / locked | Preview message | No submit CTA |
| Joined, no yes movies | Visible | Disabled / locked | `No showtimes in your list yet` + browse-all option | No submit CTA |
| Joined, has yes movies | Visible | Enabled | Active voting messaging | Submit enabled when valid |
| Joined, flexible on | Flexible state replaces or supersedes list | Not applicable | Flexible confirmation | Completion actions only |
| Opted out | Visible | Disabled / locked | Unavailable / preview message | `I'm back in!` only |
| Completed | Visible | Disabled | Completed message | `View Group Results`, `Edit my votes` |

## Results page

| User state | Results visibility | Personal relevance | CTA |
|---|---|---|---|
| Not joined | Visible | Informational only | Join / go back as appropriate |
| Joined | Visible | Includes personal context | Standard nav |
| Opted out | Visible | Personal saved context optional, does not affect rankings | `I'm back in!` optional |
| Completed | Visible | Full personal context | Standard nav |

## Rules by Feature

## Movie vote controls

### Enabled when

- user is `joined`
- not completed

### Disabled when

- user is `not_joined`
- user is `opted_out`
- user is completed

### No-vote reasons

For movie `No` voting:

- include:
  - `Schedule`
  - `Seen it`
  - `Not my vibe`
  - `Other...`

- exclude:
  - `Not feeling well`

Reason:

- that reason belongs to poll-level opt-out, not movie-level veto

## Poll-level opt-out

Explicit opt-out is separate from movie veto.

Behavior:

- user can choose `Can't make it` / `Actually, I can't make it`
- choosing it reveals opt-out reason pills
- opting out should:
  - set participation false
  - preserve prior votes unless intentionally cleared
  - remove user from active group calculation
  - place Movies and Showtimes into non-interactive preview mode

Suggested opt-out reasons:

- `Not feeling well`
- `Busy`
- `Other`
- `Skip`

## Showtime visibility rules

### All showtimes should be visible when

- user is not joined
- user is opted out
- user has no `yes` movie selections but is using browse-all preview
- explicit preview mode is requested

### Filtered showtimes should be visible when

- user is joined
- user has one or more `yes` movie selections
- normal interactive mode applies

### Showtimes should not disappear solely because

- user is not participating
- user previously opted in and then opted out
- user has locked controls

If listings exist, preview users should still see them.

## Showtime interaction rules

### Session vote controls are enabled when

- user is joined
- user is not completed
- user is not in preview-only mode

### Session vote controls are disabled when

- user is not joined
- user is opted out
- user is in preview-only mode
- user is completed

### Disabled state copy

Suggested locked copy:

- title: `Locked`
- subtitle: `Pick a movie first`

This subtitle may vary slightly by preview cause, but the control must remain visibly non-interactive.

## Hero behavior rules

## Movies hero

### Not joined

- explain preview mode
- show `Count Me In`
- optional explicit opt-out next to join CTA

### Joined

- reflect progress toward movie completion

### Opted out

- explain user is not affecting the group plan
- if reason exists, optionally show it
- offer `I'm back in!`

## Showtimes hero

### Not joined

- explain preview mode
- clarify that showtime choices unlock after joining from Movies

### Joined, no yes movies

- explain there are no showtimes in the user's shortlist yet
- provide browse-all preview option

### Opted out

- explain user is out of the plan
- still allow showtime preview
- provide `I'm back in!`

### Joined active

- explain normal time-slot voting

### Flexible

- explain user counts for all showtimes

## Bottom CTA rules

### Movies

- not joined:
  - no progression CTA to showtimes
- joined but no yes movies:
  - show disabled `Next: Pick Showtimes`
- joined with yes movies:
  - show enabled `Next: Pick Showtimes`

### Showtimes

- preview mode:
  - no submit CTA
- joined active:
  - show `Submit Vote`
- completed:
  - show `View Group Results` and `Edit my votes`

## Invariants

These should always remain true.

- preview mode means `content visible, controls locked`
- non-participating users should not affect group results
- opting out should not make showtime listings disappear
- users with no `yes` movies should still be able to preview showtimes when preview mode is intended
- movie veto reasons and poll opt-out reasons are separate concepts
- a disabled CTA should still communicate what the user must do next

## Implementation guidance

When debugging, prefer to compute and pass explicit derived flags to templates rather than letting templates infer too much.

Useful derived flags:

- `is_joined`
- `is_opted_out`
- `has_saved_votes`
- `has_yes_movies`
- `needs_movie_pick_first`
- `view_all_mode`
- `is_preview_mode`
- `show_submit_cta`
- `show_locked_showtimes`

## Open questions to review

These should be confirmed before further code work.

1. Should opted-out users see the exact same hero copy as never-joined users, or should they get distinct copy?
2. Should theater filter pills remain interactive in preview mode, or should they also be disabled?
3. Should saved prior movie/session selections be visually highlighted while a user is opted out, or should preview always appear neutral?
4. Should completed users still see locked session controls, or should controls be replaced with a read-only badge?
5. Should single-movie polls use a different showtimes hero copy in preview mode?

## Recommended next step

Review this document and decide:

- which distinctions matter product-wise
- which state names we want to standardize in code
- whether to implement an explicit `is_preview_mode` derived flag everywhere
