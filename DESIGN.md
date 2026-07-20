# DESIGN.md — Hangwork

The design system for hangwork.art (landing page) and the Hangwork editor. Every UI change must follow this file. When a rule here conflicts with a habit or a trend, this file wins.

## Brand thesis

**Restraint as respect.** Hangwork is a portfolio builder for visual artists: one payment, no subscription, the artist's site lives in an account they own. The interface behaves like a gallery wall — quiet, precise, near-invisible — so the artist's work is the only loud thing on screen.

Test for every screen: *"Does anything here compete with an artwork placed beside it?"* Whatever does, remove.

Forbidden outright: gradients, glassmorphism, drop shadows (except the functional focus ring), decorative illustrations, stock photography, emoji in UI, animated flourishes, confetti, dark patterns of any kind.

## Color

Defined once as CSS custom properties; no other colors may appear anywhere.

```css
:root {
  --paper: #FAF8F5;      /* page background — warm off-white, never pure #FFF */
  --ink: #1A1A1A;        /* primary text, logo, frames — never pure #000 */
  --ink-soft: #6B6963;   /* secondary text, nav at rest, captions, placeholders, struck prices */
  --klein: #002FA7;      /* International Klein Blue — the ONLY accent */
  --klein-press: #00248A;/* Klein hover/active state */
  --wall-1: #EDEAE4;     /* surfaces: cards, editor panels */
  --wall-2: #DDD9D0;     /* borders, dividers, inactive states */
  --wall-3: #E5E1DA;     /* alternate surface, hover fills */
  --error: #B3261E;      /* validation errors only */
}
```

### Accent discipline (the most important rule in this file)

`--klein` may cover at most ~2% of any screen. Permitted: the one primary CTA per view, the logo nail and wordmark dot, active nav state, focused input border/ring, selected canvas element in the editor, text links on hover. Never: backgrounds, section fills, icons at rest, price text, decoration. If two primary-blue elements appear in one view, demote one.

Dark mode: not supported in v1. Remove any half-implemented dark styles rather than shipping them.

## Typography

One family: **Inter** (variable font, self-hosted or Google Fonts). No second typeface anywhere; monospace only inside literal code snippets in docs.

- Weights 400 and 500 only. Never 600+.
- Hero headline: 40–56px desktop / 30–36px mobile, weight 500, letter-spacing -0.02em, line-height 1.1–1.2
- Section headings: 24–28px, weight 500, letter-spacing -0.01em
- Body: 15–16px, weight 400, line-height 1.6, --ink
- Secondary/captions/microcopy: 13–14px, --ink-soft
- Sentence case everywhere: headings, buttons, nav, labels. Never Title Case, never ALL CAPS.
- No italic. Underline only on text links on hover (underline, not color-shift alone).

## Layout and spacing

- Max content width 1100px; side padding 32px+ desktop, 20px mobile.
- Whitespace is the primary design element. 96–128px vertical between major landing sections. When unsure, double the space.
- Border radius: 4px on buttons/inputs, 3–6px on cards. Nothing pill-shaped.
- Elevation via borders (1px solid --wall-2) and background steps (--paper vs --wall-1), never shadows.
- Artwork/previews get zero decoration: no frames, no hover-zoom, radius ≤3px. Work is presented flat, as on a wall.

## Components

**Buttons.** Primary: --klein bg, --paper text, 4px radius, 10px 22px padding, weight 500; hover --klein-press, no scale or shadow. Secondary: transparent bg, 1px --wall-2 border, --ink text; hover bg --wall-3. Maximum one primary button per view. Button labels are verbs: "Hang your first piece", "Publish", "Save" — never "Submit", "OK", "Click here".

**Inputs.** White or --paper bg, 1px --wall-2 border, 4px radius, 36–40px height. Focus: border --klein + 3px ring rgba(0,47,167,0.12). Labels above the field, 13px --ink-soft. Placeholders are real examples, not instructions.

**Nav.** Text links, --ink-soft at rest, --ink current page. Contains "Pricing". No hamburger animations, no sticky-shrink effects.

**Toasts/confirmations.** Past tense, no exclamation: "Published", "Saved". Errors state what happened and what to do, one sentence, no apology, no "Error:" prefix.

## Logo

Files in /assets/brand/: `hangwork-mark.svg` (icon), `hangwork-lockup.svg` (icon + wordmark).

The mark is three elements: a heavy landscape frame (--ink, 5px stroke), a shallow hairline hanging wire (--ink, 1.75px), and the nail (--klein dot) at the apex. **The frame and wire are always ink; only the nail is Klein.** The frame represents the artist's work — Hangwork's color never fills it. Rationale: Hangwork provides the nail; the artist provides everything in the frame.

Variants:
- On dark/ink backgrounds: frame and wire become --paper; nail stays --klein.
- All-ink (grayscale print): nail becomes --ink.
- All-Klein (entire mark #002FA7): special occasions only — loading states, stickers, launch material. Never the default.
- Favicon: mark alone. Wordmark type converted to outlines wherever Inter isn't guaranteed to load.

Wordmark: "hangwork" in Inter 500, ink, with the period in "hangwork.art" in --klein. Clearspace around the mark: at least the height of the wire triangle on all sides.

## Voice

- The name is a verb — use it: "Hang your first piece", "Rehang anytime", "Your wall".
- Never in user-facing text: "repository", "repo", "git", "commit", "deploy", "push". GitHub is "a free account where your site is stored"; signup is "Claim your space".
- Never: "simply", "just", "easy", "seamless", "unlock", "empower", "leverage".
- Contractions yes; exclamation marks no.
- The ownership story leads: "Your portfolio lives in an account you own — not ours." "One payment. No subscription. No hostage fees."
- Every claim of "forever"/"own it" links to the FAQ answer explaining what happens if Hangwork shuts down. The promise always sits one click from its proof.

## Pricing display

- Prices live in one shared config (launchPrice, regularPrice, refundDays, launchPricingActive) — never hardcoded in components.
- While launch pricing is active, format everywhere as: struck regular price in --ink-soft, live price in --ink. Klein is never used on price text.
- A price never appears without "once" or "one-time" beside it.
- Placements: hero microcopy, #pricing section (with the annual-subscription comparison), nav link, FAQ money section, checkout summary, editor upgrade prompt if a demo mode exists.
- No urgency theatrics: no countdown timers, no claimed-percentage bars, no exit popups. The only scarcity mention is the honest milestone line in the pricing section.

## Editor-specific

The editor sits beside the artist's actual work all day, so it is even quieter than the landing page.

- Chrome (toolbars, panels): --wall-1 bg, 1px --wall-2 dividers. Canvas/preview bg is --paper or the user's chosen color.
- Icons: outline style (Lucide/Tabler), 16–20px, --ink-soft at rest, --ink hover. Never filled, never colored.
- Selection: 1.5px --klein outline on the active canvas element — the editor's only accent use besides Save/Publish.
- Destructive actions: --error text or border, always confirmed, never a red filled button.
- Panel text 13–14px. Tooltips: --ink bg, --paper text, no arrows.

## Quality floor

- Responsive to 360px. If the editor is desktop-only, mobile gets a polite explanatory screen, not a broken layout.
- Visible keyboard focus (the Klein ring) on every interactive element.
- Contrast: --ink/--paper and --ink-soft/--paper pass WCAG AA at their sizes; --klein on --paper for text 14px+.
- prefers-reduced-motion respected; there should be little motion to reduce.

## Working process for agents

1. Before styling anything new, check whether a token, component rule, or voice rule above already decides it. It usually does.
2. Never introduce a new color, weight, radius, or shadow. If a design need seems to require one, stop and flag it instead.
3. After changing a surface, screenshot it and self-critique against the brand test: does anything compete with an artwork beside it?
4. Chanel rule: before finishing any screen, remove one element.
