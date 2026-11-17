# UI brand guidelines

How the Inventory and Printing apps should look and behave. These apply to every new screen. They follow the **Monash Automation Brand Identity Guidebook (v1.0)**, and record the decisions made for these two apps.

Inventory and Printing are **tools**, not programs, so both use the Monash Automation main colours exactly as the guidebook defines them.

## Decisions

| Date | Decision | Why |
|---|---|---|
| 2026-11-17 | **The primary button is Automation Blue** (`#1393FF`) **with Onyx text** (`#231F20`). | The guidebook asks for Blue as the accent. Onyx on Blue is 5.2 : 1 contrast and passes; white on Blue is 3.2 : 1 and does not, so never put white text on Blue. |
| 2026-11-17 | **Printing has no program colour.** Both apps use Onyx, Platinum and Blue. | The guidebook reserves program colours (yellow, purple, green, coral) for program-specific work. These apps are tools, so they stay on the main palette. |
| 2026-11-17 | Navigation is tiered by how often places are used; one primary action per screen; one action per table row. | Keeps the apps simple. Daily things are visible, rare things are one click away. |

If you want to change one of these, add a new row with the date and reason instead of editing the old one.

## Colour

Blue is an **accent only**: the primary button, the active menu marker, links and focus. It is never a page or card background. Onyx and Platinum carry the interface.

| Token | Light | Dark | Used for |
|---|---|---|---|
| `background` | `#F5F5F7` Platinum | `#1A1718` | Page |
| `card`, `sidebar` | `#FFFFFF` | `#262223` | Cards, sidebar, menus |
| `foreground` | `#231F20` Onyx | `#F5F5F7` | Text |
| `muted-foreground` | `#6B6869` | `#A9A5A6` | Secondary text |
| `primary` | `#1393FF` Blue | `#1393FF` | Primary button, active marker, focus ring |
| `primary-foreground` | `#231F20` Onyx | `#231F20` | Text on Blue |
| `link` | `#0A6FD1` | `#4DB0FF` | Text links (Blue itself is too light for small text on white) |
| `border` | `#D9D8DB` | white 12% | Lines |

Dark mode uses neutrals derived from Onyx. Tokens live in `src/index.css`; use the Tailwind names (`bg-primary`, `text-muted-foreground`, `text-link`) and never hard-code hex values in components.

### Status colours

Meaning, not decoration. Use the `Badge` variants:

| Variant | Use | Example |
|---|---|---|
| `success` (green) | Fine, available | In storage, Ready |
| `info` (blue) | Normal activity | **On loan**, Printing |
| `warning` (amber) | Needs a look soon | Low stock, pending count |
| `danger` / destructive (red) | Needs action now | Overdue, failed, needs attention |

Being on loan is normal, so it is **blue, not red**. Do not use red for anything that is not an error or a risk.

## Typography

- **Blinker** (400, 600, 700) is the interface font. Files are in `src/assets/fonts/blinker/` (SIL Open Font License, included).
- **Source Sans Pro** is the fallback when Blinker is unavailable, as the guidebook specifies. Both are set in `--font-sans`.
- **Excon** is for the stacked logo only. It is not used in the interface.
- **Glacial Indifference** (short highlighted lines and captions only, never paragraphs or titles) is in the guidebook but we have no font files for it, so it is not used. If it is added later, keep it to that role.
- Titles use weight 700, labels 600, body 400. Use `tabular-nums` for numbers that line up in columns.

## Logos

Use the supplied logo files unmodified; never redraw or recolour them.

- Header: `Horizontal Black & Blue.svg` on light, `Horizontal White & Blue.svg` on dark (`src/assets/`).
- App tiles: `src/assets/ma-inventory.svg` and `src/assets/ma-3d-print.svg`.
- The browser tab icon follows the app; Inventory keeps the default favicon.

## Buttons

At most **one primary button per area**: the sidebar's app action (Scan item, New print) is always there, so inside the page keep to the single main action (or one per table row). Do not repeat the sidebar action as a second Blue button on the page. Everything else is lower in the hierarchy.

| Level | Variant | Look | Use |
|---|---|---|---|
| Primary | `default` | Blue fill, Onyx text | The one thing you came to do: Check out, Save, New print |
| Secondary | `outline` | Onyx outline | Alternatives: Return, Print label, Cancel |
| Quiet | `ghost` / `link` | Text only | Low-key actions, links |
| Danger | `danger` | Red outline | Risky action next to normal ones |
| Confirm | `destructive` | Red fill | **Only** on the final confirm step of a delete or revoke |

Rarely used or risky actions (edit, delete, upload image) go in a "⋯" menu, not beside the main action. Touch targets are at least 44 px on phones. Focus is always visible (Blue ring).

## Navigation

Items are grouped by how often they are used. Keep the daily list to **four items at most**; anything occasional goes under **More**.

| | Inventory | Printing |
|---|---|---|
| **Primary action** | Scan item | New print |
| **Daily** | Home, Assets, Check in, Consumables | Overview, Monitor, Queue, My prints |
| **More** (collapsed) | My requests, Activity, Chat | Send G-code, Cameras, History, Stats |
| **Admin** (admins only) | Requests (pending badge), Members | Printers |
| **Footer** | Cart, account, notifications, theme | account, notifications, theme |

- The configuration is in `src/components/sidebar/nav-config.ts`. Change it there, not in the components.
- The app switcher (top of the sidebar) switches between Inventory and Printing and links to the Authentik library.
- Adding a page: ask "will most people use this every visit?" Only then does it go in Daily. Otherwise put it in More, or reach it from a related page.
- On phones the sidebar becomes a bottom bar: three daily tabs, the primary action in the middle, and More.
- Do not use icon-only navigation on desktop; labels are always shown.

## Tables and rows

One action per row, chosen for what is possible with that item:

- In storage: **Add to cart** (primary).
- Held by you: **Return**.
- Held by someone else, or lab use: no button.
- Admins get a "⋯" menu with Edit and Delete.

## Item page

The page a phone lands on after scanning a QR label. From top to bottom: name, serial and location, a status chip, and **one primary action** (Check out, or Check in if you hold it). Then details, recent loan history, tags and notes. The QR code, Copy link and Print label share one small card. Admin tools (image, assign, revoke, restock) stay out of the way.

## Checklist for a new screen

- [ ] One primary (Blue) button in the page area, and it does not repeat the sidebar action.
- [ ] Colours come from tokens; no hex values in components.
- [ ] Status uses the `Badge` variants; red only where action is needed.
- [ ] Works in light and dark mode.
- [ ] Usable at phone width, with 44 px touch targets.
- [ ] Its menu item sits in the right tier (see Navigation).
- [ ] Text on Blue is Onyx.
