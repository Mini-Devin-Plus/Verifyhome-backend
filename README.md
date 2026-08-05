# VerifyHome — Backend

Business logic services, TypeScript types, and PostgreSQL database schema for the VerifyHome platform.

## Structure

```
├── database/         # PostgreSQL schema
├── services/         # All business logic services (TypeScript)
└── types/            # Shared TypeScript type definitions
```

## Stack
- PostgreSQL (database)
- TypeScript (services/types)
- Node.js (runtime — to be wired up)

## Services
Auth, OTP, Property, Deal, Escrow, Payment, Chat, Calls, Fraud Detection,
Beta User Management, Feature Flags, Observability, Admin Security, Audit Logging.

## Database
See `database/schema.sql` for the full PostgreSQL schema.
