# Inventory Management System

A modern, full-stack inventory management system built with React, TypeScript, tRPC, and PostgreSQL. Features comprehensive asset tracking, consumables management, transaction history, QR code scanning, and AI-powered chat assistance.

## Features

- **Asset Management**: Track items with serial numbers, locations, images, tags, and cost
- **Consumables Tracking**: Monitor available and total quantities of consumable items
- **Transaction System**: Record loans, returns, and other item movements with full audit trail
- **QR Code Support**: Generate and scan QR codes for quick item identification
- **Location Hierarchy**: Organize items using nested location structures
- **Tag System**: Categorize items with color-coded tags and tag groups
- **User Management**: Role-based access control with user groups and ban system
- **Shopping Cart**: Add multiple items for batch operations
- **Check-in System**: Streamlined process for returning items
- **Dashboard**: Visual analytics with charts and statistics
- **AI Chat Assistant**: Integrated chat interface powered by LangChain and Ollama
- **Dark Mode**: Automatic theme switching based on system preferences
- **G-code Printing**: Upload, hash, archive, and dispatch G-code jobs to configured Prusa/Bambu printers by IP
- **Print Validation & Audit**: Enforces G-code extension/size checks and stores per-user print job statuses

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
- **Docker** - Containerization

## Prerequisites

- [Bun](https://bun.sh/) (v1.0 or later)
- [Docker](https://www.docker.com/) and Docker Compose (for database)
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

Create a `.env` file in the root directory:

```env
# Database
DATABASE_URL="postgresql://postgres:password@localhost:5432/mydb?schema=public"

# Frontend URL (for CORS)
FRONTEND_URL="http://localhost:5173"

# Server Port
PORT=3000

# MCP Password (for Model Context Protocol endpoint)
MCP_PASSWORD="your-secure-password-here"

# Better Auth (add your auth configuration)
# See Better Auth documentation for required variables

# Optional: Bambu dispatch bridge webhook (required for BAMBU printer type dispatch)
BAMBU_BRIDGE_URL="http://localhost:8081/bambu/dispatch"
```

### 4. Start the database

```bash
bun run db
```

This will start a PostgreSQL database using Docker Compose.

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
├── server/
│   ├── index.ts               # Hono server entry point
│   ├── api/                   # tRPC routers
│   ├── auth/                  # Authentication configuration
│   └── trpc/                  # tRPC setup
├── src/
│   ├── pages/                 # Page components
│   ├── components/            # Reusable components
│   ├── server/                # tRPC server-side code
│   ├── client/                # tRPC client setup
│   ├── auth/                  # Auth components and providers
│   ├── contexts/              # React contexts
│   ├── hooks/                 # Custom React hooks
│   └── lib/                   # Utility functions
├── public/                    # Static assets
└── docker-compose.yml         # Docker configuration
```

## Database Schema

The system uses the following main models:

- **Item**: Core inventory items with serial numbers, locations, tags, and cost
- **Consumable**: Tracks available/total quantities for consumable items
- **Location**: Hierarchical location structure
- **Tag**: Categorization system with colors and groups
- **User**: User accounts with groups, roles, and ban management
- **ItemRecord**: Transaction history for all item movements
- **Group**: User groups with parent-child relationships
- **Chat**: AI conversation storage

## Authentication

The system uses [Better Auth](https://www.better-auth.com/) for authentication. Configure your auth providers in the server configuration.

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
