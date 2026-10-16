# maims — Monash Automation Inventory System CLI

Read-only command-line client for the inventory system. Everything you can
*see* in the web UI you can see here: items, locations, tags, groups,
consumables, purchase requests, users, dashboard stats, the 3D-print fleet
(who's printing what), the print queue, print statistics, notifications,
the audit log, and outages.

Mutations are deliberately out of scope for now — the CLI cannot check
items in/out, restock, print, or change anything. That is enforced
**server-side** on the token, not just hidden in the CLI.

## Build

```sh
cd cli
cargo build --release
# binary at target/release/maims
```

## Auth

Create a token in the web UI: **Settings → API tokens → New token**
(or with an existing token: `maims tokens create -n laptop`).
The plaintext is shown exactly once; the server stores only its SHA-256 hash.

```sh
maims auth -u inventory.monashautomation.com -t mai_…
# longhand: maims auth login --url … --token …
```

This saves to `~/.config/maims/config.json` (0600). Override the location
with `--config <path>`, `$MAIMS_CONFIG`, or `$MAIMS_CONFIG_DIR`.
Per-invocation overrides: `-u/--url` and `-t/--token` anywhere.

Check what's configured with `maims auth status` (token is masked).

## Commands

```
maims whoami                        who you are on the server
maims items list|get|serial|count|image
maims locations list|roots|children|get|has-children
maims tags list|get
maims groups
maims consumables list|get|low-stock
maims requests list|mine|pending-count|get
maims records list|for-item|for-user|recent
maims users list|get                (admin)
maims dashboard stats|loans|low-stock|overdue
maims printers list|active|status|jobs|filament|ams|ratings|history|stored
maims queue list|jobs|upcoming|job
maims stats overview|daily|usage|filament|filament-usage|filament-history|failures|top-failures|users|printers|duration|queue-duration|errors|error-breakdown|ratings|summary
maims notifications list|unread|count
maims audit list|for-entity|recent  (admin)
maims outages                       uptime/status-page incidents
maims tokens list|create|revoke     manage your own API tokens
maims call <path> [json]            any read-only query, escape hatch
```

Flags: `--json` for machine-readable output, `-u`/`-t` to override the
saved config.

### Examples

```sh
maims printers active               # what's printing right now, and for whom
maims printers filament             # spool levels per printer
maims queue list                    # the BamBuddy print queue
maims stats users --limit 10        # who prints the most
maims items list --search soldering --limit 20
maims audit recent                  # latest admin-visible activity
maims call item.countByName '{"name":"Drill"}'
```

## Token model

- Tokens look like `mai_<64 hex>`; only the hash is stored.
- Created via the UI (Settings → API tokens) or `maims tokens create`.
- **Read-only is the default and the floor**: non-admins always get
  read-only tokens; tokens created *through* another token are forced
  read-only, so a CLI token can never mint a more powerful one.
- Admins can create read-write tokens from the browser UI for automation;
  the CLI itself only ever issues read-only ones.
- `maims tokens create/revoke` work even with a read-only token (rotation
  without a browser), but everything else that changes state is rejected
  by the server with `FORBIDDEN: This API token is read-only.`
- Optional expiry (1–365 days); revocation is instant; every create/revoke
  lands in the audit log (`TOKEN_CREATED` / `TOKEN_REVOKED`).

## Tests

```sh
cargo test          # 52 unit tests: URL/config handling, tRPC wire format,
                    # output rendering, every command's arg→input mapping
```
