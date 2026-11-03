# AI apps view

An opt-in shell view for the phone and the desktop that copies the layout the ChatGPT, Claude and Perplexity apps
converged on, with Wizard's apps where they put Projects / GPTs / Spaces. Off by default: nobody's shell changes until
they switch it on, and switching it off brings the stock shell (Desks) back exactly.

## Switching it on

Settings › Look › Tweaks › **Different shell view - AI apps** (tweak id `miguel/ai-apps`, by Miguel). It is an
ordinary off-by-default tweak, so anyone can turn it on, on any skin, with no other tweak needed. Shell views are one
at a time: turning it on turns Orb and Apps off; turning it off goes back to Desks. The choice follows the owner's Look
(per owner when look sync is present, per device otherwise).

## What it looks like

Phone (`web/layouts/ai-apps/layout.js`, `layout.css`, `home.js`):
- Top bar: ☰ (with the Ready count) · Home · the workspace switcher. An edge swipe or ☰ opens the left drawer.
- Drawer: search (chats and apps), the chat list in the stock Chats sections (Archive, Working, Snoozed, Ready; a long
  press gives Pin, Rename, Mark unread, Snooze, Archive / Restore through Chats' own actions), New chat at the bottom.
- Main screen: the chat, edge to edge, with the stock composer as a pill (+ · field · model chip · the orb as the mic ·
  Send). Home = a New chat with no greeting.
- Home: the pinned apps live in a dock just above the composer (a subtle glass plate from skin tokens, up to 2 rows ×
  4 icons at the grid's size, names under; more than 8 pins page sideways with dots; it steps away while the composer
  is typed in). The grid above shows only the open apps that are not pinned, then + = a picker of installed apps
  neither pinned nor open (For people / For agents; Get more opens the App Store); nothing else open = just +. Hold and
  drag within the dock, within the grid, or between them (into the dock pins it at that spot, out of it unpins); a hold
  without moving = the app's menu (Pin / Unpin, …). Every open app wears a 4 px running dot; a pin not open has none.
- Under +: "Unused apps close after 24h · Change" opens a sheet with the tidy sentence (below). A tidy shows a toast
  "Closed 3 apps you hadn't used in 24 hours · Undo".
- Drawer Ready: in the stock Chats Filter order (Priority / Newest / Oldest, the control on Ready's header; the desktop
  offers only Newest / Oldest inside each status group, below).
- An app fills the screen under the same top bar; the orb sits in the app's own bottom row (Orb bar standard).
- A take (tap the orb) uses the stock voice controls, painted with the skin's tokens.

Desktop (`desktop.js`, `desktop.css`):
- Left: the chats sidebar (search, sections, New chat), foldable to a 52 px rail of counts (Snoozed, Ready and Ready's
  statuses). The open sidebar is built on the rail: Ready's count sits on its header (the rail's amber disc, none on
  ◫), Ready is grouped by the rail's statuses (sub-headers with counts, its chats under each in the chosen order),
  Snoozed shows only when it holds chats, and the headers sit at the rail items' heights, so folding only widens or
  narrows. Headers and status sub-headers are small and muted (12 / 11 px, normal weight; Archive the quietest); only
  Ready's amber count stands out, so the chat titles lead.
- The folded rail works on its own (nothing expands but ◫): a click on Snoozed, Ready or a status opens that group's
  first chat in the docked chat column; the same item again opens the next one (wrapping). The current group is marked
  and shows its place ("2/3"). Hovering an item for 300 ms shows a flyout of its chats (title, time); a click opens one;
  Esc closes it. Nothing advances on send (stock has no such setting).
- Order inside each status group (the grouping already is the priority): Newest first / Oldest first in Settings ›
  Chats & app screens › AI apps view, saved where stock Chats keeps its order (`api.sessions.order / setOrder` →
  `wos.chats.readyOrder.v1`; a stock Priority or By subject reads as Newest here). "Show sort control in sidebar"
  (off at first) adds a small Newest / Oldest menu on Ready's header. The group is mounted through the layout API's
  `desk.setting(id, node)` (core/skin-host.js).
- Middle: the chat in a centred column with the composer.
- Right: one apps column = Pinned · Open · + (drag to rearrange; ⌥ letters through the shell's own key guide). An app
  opens as a panel beside the chat; panels resize by grips. An open pin wears the same 4 px running dot as the phone.
  At its foot a small "Tidy: 24h" line expands into "Tidy up: close apps you haven't used in [24 hours ▾]. Pinned apps
  always stay open." (Off / 12 hours / 24 hours / 1 week).

## Keys (desktop)

One base key, ⌥ (Option / Alt). Hold left ⌥ for the shell's hints on their targets.

| Key | In the AI apps view |
| --- | --- |
| ⌥↓ / ⌥↑ | Next / previous Ready row exactly as the sidebar draws it (grouped, chosen order, notifications included); wraps |
| ⌥N, ⌥Enter | New chat (Home) |
| ⌥\\, Ctrl/⌘⇧S | Fold / unfold the sidebar |
| ⌥I | Search chats and apps (the sidebar's search) |
| ⌥T, ⌥O | The app picker (+) |
| ⌥1–9 | The right column's rows, top to bottom |
| ⌥[ / ⌥] | Previous / next row of the right column (wraps) |
| ⌥⇧[ / ⌥⇧] | Move the row in front up / down |
| ⌥ + A B E J K M Q U Y | Open the app wearing that letter (shown while ⌥ is held) |
| ⌥W | Close the app in front (a pinned one hides) or the docked chat; nothing on Home |
| ⌥F | App panel wider / back |
| ⌥− / ⌥= | App panel narrower / wider |
| ⌥` | Home |
| ⌥← / ⌥→ / ⌥X | Snooze / Done / Resolve the chat in front (stock) |
| ⌥S ⌥C ⌥D ⌥V | Talk, command, dictate, talk into a new chat (stock) |
| ⌥Space, ⌥, ⌥/ ⌥G ⌥P ⌥Z ⌥⇧W ⌥L ⌥R | Palette, Settings, key guide, pick, float chat, jump back, reopen, light/dark, reload (stock) |
| ⌥⇧1–9 | Nothing (no desks to move windows to) |

## How it is built

- The tweak only calls `api.layout.use('ai-apps')` (`web/tweaks/miguel/ai-apps/tweak.js`); everything else is the
  layout, loaded only while worn (`html[data-layout="ai-apps"]`).
- It reads the shell through the layout API in `core/skin-host.js` (adapters in `web/app.js` and
  `web/desktop/desktop.js`): `sessions.*` (list, open, newChat, act), `apps.*` (list, kinds, logo, badgeText, open,
  openDesk, close, inset, store, get, homeScreen), `desks.*` (list, close, move), `workspaces.*`, `voice.*`, `orb.*`,
  `keys.*`, `phone.*`, `gesture.*`, `storage.*`. These hooks are inert unless a layout is worn.
- The app picker is the shared view chrome (`web/layouts/apps/chrome.js`, `viewChrome().open({ exclude, people })`),
  grouped by `WosAppKinds`.
- Per-device state (the layout's own `api.storage`): `pins`, `vtManual`, `used`, `tidy`, `sections`, `folded`,
  `tabsFolded`, `widths`, `appKeys`.

## Skin rules

- Colours come only from skin tokens (`--wz-*`, `--ink*`, `--bg`, `--sk-*`, `--amber`, `--line*`); the only literal
  colours are colour-neutral shadows/scrims (`color-mix(... black N%, transparent)`) and the white glyph on a full-colour
  app tile. `tests/ai-apps-view.test.mjs` checks the desktop CSS for literals.
- Light skins (`-light` ids and Sepia) get full-colour app tiles with white glyphs; dark skins keep tinted plates.
- The skin background must stay still and unveiled behind the view (`tests/skin-background-stable.test.mjs`).
- Every change is checked on a dark and a light skin, phone and desktop, before it ships.

## Tests

`tests/ai-apps-view.test.mjs` (layout behaviour in a fake DOM), `tests/shell-view-setting.test.mjs` (one view at a
time), `tests/skin-background-stable.test.mjs`, `tests/tweak-packages.test.mjs` (the tweak contract), and
`tests/voice-controls-skin.test.mjs` (the take's controls follow the skin; separate fix PR).
