# Prisma Migrations

This directory contains database migration files. Migrations are applied via:
- Development: `bun run db:migrate` (creates + applies migration)
- Production: `bunx prisma migrate deploy` (applies pending migrations only)

## Initial Migration
To create the baseline migration:
```bash
bunx prisma migrate dev --name baseline --create-only
bunx prisma migrate deploy
```

## Important
- NEVER run `prisma db push` in production — it's destructive and has no rollback
- ALWAYS create a migration for schema changes
- Test migrations on a staging database before applying to production
