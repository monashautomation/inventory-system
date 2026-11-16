# Inventory Management System

A full-stack inventory and 3D-printing system for student teams, built with React, TypeScript, tRPC, and PostgreSQL. It is really two apps in one codebase that share sign-in, users and the database:

- **Inventory** (`/dashboard`): assets, consumables, loans, restock requests, activity log
- **Printing** (`/printing`): printer monitoring, the Bambu print queue, G-code sending, print history and statistics

Both are launched from [Authentik](https://goauthentik.io/), which is also the only sign-in method. The sidebar shows the navigation for whichever app you are in, with a switcher and an "All apps" link back to the Authentik library.

## Features

### Inventory

- **Asset Management**: Track items with serial numbers, locations, images, tags, and cost
- **Consumables**: Monitor available and total quantities, restock, and track suppliers
- **Loans**: Cart-based checkout, check-in, and a full per-item transaction history
- **Restock Requests**: Members request consumables; admins mark them Ordered, Received or Cancelled (with notifications)
- **QR Codes**: Generate item labels and scan QR codes for quick lookup, checkout and return
- **Location Hierarchy and Tags**: Nested locations, color-coded tags and tag groups
- **Members**: Role-based access, user groups, bans, and member sync
- **Dashboard**: A personal Home tab and, for admins, an Admin overview tab with charts, low stock and the audit feed
- **Activity and Audit Log**: Transactions plus audit events (requests, API tokens)
- **Kiosk**: Shared terminals for student-ID checkout/check-in, after-hours lab access logging and printer status
- **AI Assistant** (`/chat`): Chat interface powered by LangChain and Ollama, with tool access through the MCP endpoint

### Printing

- **Print Queue**: Upload a 3MF, pick a printer or model, map AMS filaments and queue it on Bambu printers through BamBuddy
- **Send G-code**: Upload, hash, archive and dispatch G-code to configured Prusa printers, with extension and size validation (Bambu jobs go through the Print Queue)
- **My prints**: Your queued and sent jobs with status, plus reprint for stored files
- **Monitor and Cameras**: Live telemetry, pause/resume/cancel, AMS spool assignment, build-plate clearing and print ratings, and a webcam wall
- **History and Stats**: Per-job log, filament usage by person and project, success rate, leaderboard and CSV export
- **Failure alerts**: Failed prints post a short diagnosis to a Discord webhook
- **Printers** (admin): Register Prusa printers; Bambu printers sync from BamBuddy

### Platform

- **API tokens and CLI**: API tokens (Settings → API tokens) and the read-only `maims` command-line client, see [`cli/README.md`](cli/README.md)
- **MCP endpoint** at `/mcp` for AI integration, and a Prometheus `/metrics` endpoint
- **Dark mode**: Follows the system preference

## Routes

| Area | Routes |
|---|---|
| Inventory | `/dashboard` (`?tab=admin` for admins), `/assets`, `/consumables`, `/consumables/requests` (admin), `/my-requests`, `/checkin`, `/cart`, `/activity`, `/members` (admin), `/item/:id`, `/qr/*`, `/chat`, `/settings` |
| Printing | `/printing` (overview), `/printing/my-prints`, `/printing/queue`, `/printing/send`, `/printing/monitor`, `/printing/cameras`, `/printing/history`, `/printing/stats`, `/printing/printers` (admin) |
| Kiosk | `/kiosk`, `/kiosk/home`, `/kiosk/checkout`, `/kiosk/checkin`, `/kiosk/after-hours`, `/kiosk/print-status`, `/kiosk/provision` |

The old top-level print URLs (`/print`, `/print-queue`, `/print-monitor`, `/print-cam`, `/print-stats`, `/print-history`, `/printer-management`) redirect permanently to their `/printing/*` equivalents, so existing bookmarks and links keep working. Route constants live in `src/lib/printingRoutes.ts`.

## Tech Stack

### Frontend

- **React 19** - UI framework
- **TypeScript** - Type safety
- **Vite** - Build tool and dev server
- **TailwindCSS** - Styling
- **Radix UI** - Accessible component primitives
- **React Router** - Client-side routing
- **TanStack Query** - Data fetching and caching
- **tRPC** - End-to-end typesafe APIs
- **React Hook Form** - Form management
- **Recharts** - Data visualization
- **Zod** - Schema validation

### Backend

- **Hono** - Web framework
- **tRPC** - Type-safe API layer
- **Prisma** - ORM and database toolkit
- **PostgreSQL** - Database
- **Better Auth** - Authentication system
- **LangChain** - AI/LLM integration
- **Ollama** - Local LLM support

### Development Tools

- **Bun** - Runtime and package manager
- **Vitest** - Testing framework
- **ESLint** - Code linting
- **Prettier** - Code formatting
- **Husky** - Git hooks
- **Docker** - Containerisation

## Prerequisites

- [Bun](https://bun.sh/) (v1.0 or later)
- [Docker](https://www.docker.com/) and Docker Compose (PostgreSQL and MinIO)
- An [Authentik](https://goauthentik.io/) OAuth2/OpenID application for sign-in (see Authentication)
- Optional: a BamBuddy instance for Bambu printers
- [Node.js](https://nodejs.org/) (v18 or later) - if not using Bun

## Getting Started

### 1. Clone the repository

```bash
git clone <repository-url>
cd inventory-system
```

### 2. Install dependencies

```bash
bun install
```

### 3. Set up environment variables

Copy `.env.example` to `.env` and fill it in. The main groups are:

```env
# Core
DATABASE_URL="postgresql://postgres:password@localhost:5432/mydb?schema=public"
FRONTEND_URL="http://localhost:5173"   # CORS and trusted origin
PORT=3000
BETTER_AUTH_URL="http://localhost:3000"
BETTER_AUTH_SECRET=""

# Sign-in (Authentik OAuth2/OpenID application with slug "inventory-system")
AUTHENTIK_CLIENT_ID=""
AUTHENTIK_CLIENT_SECRET=""

# Kiosk terminals
KIOSK_SECRET=""
VITE_KIOSK_SECRET=""

# AI assistant and MCP
OLLAMA_URL=""
OLLAMA_MODEL=""
OLLAMA_AUTH_TOKEN=""
MCP_ENDPOINT=""
MCP_PASSWORD="your-secure-password-here"

# G-code storage (MinIO / S3)
S3_ENDPOINT="http://localhost:9000"
S3_BUCKET="gcode-vault"
S3_ACCESS_KEY_ID="admin"
S3_SECRET_ACCESS_KEY="password123"

# Bambu printers via BamBuddy
BAMBUDDY_ENDPOINT=""
BAMBUDDY_API_KEY=""

# Label printer
PRINTER_URL="http://localhost:6767/printer"

# Notion / Discord integrations (all required to enable them)
NOTION_TOKEN=""
MEMBERS_DB_ID=""
PROJECTS_DB_ID=""
TAMARIN_API_BEARER_TOKEN=""
AFTER_HOURS_DISCORD_WEBHOOK=""
AFTER_HOURS_GUILD_ID=""
AFTER_HOURS_BOT_TOKEN=""
PRINT_FAILURES_DISCORD_WEBHOOK=""      # inert when unset

# Prometheus metrics (/metrics)
METRICS_ENABLED=false
METRICS_USERNAME=""
METRICS_PASSWORD=""
METRICS_PRUSA_ENABLED=true
METRICS_BAMBU_ENABLED=true
METRICS_BAMBU_SOURCE="prometheus"      # or "legacy"
```

Several variables are only read in specific places (for example `PRINTER_PROFILES_JSON`, `UPTIME_KUMA_*` for the status banner, and `LOG_LEVEL`); search the code for `process.env` if you need the full list.

### 4. Start the database

```bash
bun run db
docker-compose up -d minio createbuckets   # G-code storage (optional unless you use Send G-code)
```

`bun run db` starts PostgreSQL using Docker Compose. MinIO provides the `gcode-vault` bucket used for stored G-code files.

### 5. Run database migrations

```bash
bunx prisma migrate dev
```

### 6. Generate Prisma Client

```bash
bunx prisma generate
```

### 7. (Optional) Generate sample data

```bash
bun run generate
```

### 8. Start the development server

```bash
bun run dev
```

This will start both the frontend (Vite) and backend (Hono) servers concurrently.

- Frontend: http://localhost:5173
- Backend API: http://localhost:3000
- Health check: http://localhost:3000/health

## Available Scripts

- `bun run dev` - Start development servers (frontend + backend)
- `bun run build` - Build for production
- `bun run start` - Start production preview server
- `bun run db` - Start PostgreSQL database with Docker
- `bun run backend` - Start only the backend server
- `bun run generate` - Generate sample data
- `bun run seed:printers` - Seed printers (see `config/printers.example.json`)
- `bun run test` - Run tests
- `bun run test:watch` - Run tests in watch mode
- `bun run lint` - Lint code
- `bun run format` - Format code with Prettier

## Project Structure

```
inventory-system/
├── prisma/
│   ├── schema.prisma          # Database schema
│   └── migrations/            # Database migrations
├── server/                    # Hono entry point (index.ts), health, metrics, seed scripts
├── cli/                       # maims: Rust command-line client
├── config/                    # Example printer config
├── src/
│   ├── pages/                 # Page components (inventory, printing, kiosk)
│   ├── layouts/               # App shell, Items, and the Printing layout
│   ├── components/            # Reusable components (sidebar, print-queue, print-stats, ...)
│   ├── server/                # tRPC routers (api/routers), lib (BamBuddy, pollers), schema, auth
│   ├── client/                # tRPC client setup
│   ├── auth/                  # Auth components and providers
│   ├── contexts/              # React contexts (cart, kiosk)
│   ├── hooks/                 # Custom React hooks
│   └── lib/                   # Utilities, route constants, workspaces
├── public/                    # Static assets
└── docker-compose.yml         # Postgres + MinIO for local development
```

## Database Schema

Everything lives in one PostgreSQL database and one Prisma schema. The two apps share only users, sessions, notifications, the audit log and API tokens; no print table references an inventory table.

**Inventory**

- **Item**, **Consumable**, **ConsumableSupplier**, **ConsumableRequest**: items, stock and the restock request lifecycle
- **ItemRecord**: transaction history for loans, returns and consumption
- **Location**, **Tag**, **TagGroup**, **Group**: hierarchy, categorisation and user groups
- **Chat**: AI conversation storage

**Printing**

- **Printer**, **GcodePrintJob**: registered printers and G-code jobs sent directly
- **PrintQueueSubmission**: Bambu queue jobs, linked to BamBuddy queue items, with captured filament and status
- **PrintRating**: post-print ratings

**Shared**

- **User**, **Session**, **Account**, **Verification**: accounts and sign-in
- **Notification**, **AuditLog**, **ApiToken**

## Authentication

Sign-in uses [Better Auth](https://www.better-auth.com/) with a single generic OAuth provider, Authentik (`providerId: authentik`). Email and password sign-in is disabled. The OIDC discovery URL is set in `src/server/auth.ts`; create an OAuth2/OpenID provider and application in Authentik with the slug `inventory-system`, and set the redirect URI to `<BETTER_AUTH_URL>/api/auth/oauth2/callback/authentik`.

**Authentik tiles:** the app ships two launch URLs, so you can add two tiles that share the same provider: **Inventory** at `/dashboard` and **Printing** at `/printing`. The logos are in `src/assets/ma-inventory.svg` and `src/assets/ma-3d-print.svg` for use as tile icons.

Roles (`admin` or user) are stored in the database and checked by the API and the UI. Kiosk terminals authenticate with the `x-kiosk-token` header, validated against `KIOSK_SECRET`.

## API Documentation

The API is built with tRPC, providing end-to-end type safety. All API routes are available under `/api/trpc/*`.

### MCP Endpoint

The system exposes a Model Context Protocol (MCP) endpoint at `/mcp` for AI integration. Access requires basic authentication (username: `bot`, password: set via `MCP_PASSWORD`).

## Docker Deployment

### Build and run with Docker Compose

```bash
docker-compose up --build
```

The application will be available at:

- Frontend: http://localhost:4173
- Backend: http://localhost:3000

The container starts with `prisma db push` and then `bun run start`, so the schema is applied on startup. Run only one replica at a time during a rollout, or move schema changes to a pre-deploy job, so two instances never push at once.

## Development

### Code Quality

The project uses:

- **ESLint** for linting (configured in `eslint.config.js`)
- **Prettier** for formatting
- **Husky** for git hooks (pre-commit runs lint, format, and tests)

### Testing

Tests are written with Vitest and React Testing Library:

```bash
bun run test          # Run tests once
bun run test:watch    # Run tests in watch mode
```

## Contributing

1. Create a feature branch
2. Make your changes
3. Ensure tests pass (`bun run test`)
4. Ensure code is formatted (`bun run format`)
5. Ensure linting passes (`bun run lint`)
6. Submit a pull request

## License

This project is licensed under the GNU Affero General Public License v3.0 (AGPL-3.0). See the [LICENSE](LICENSE) file for details.

## Support

For issues and questions, please open an issue on the repository.
