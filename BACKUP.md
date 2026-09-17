# SGTX Git Protection Policy

## Immutable Release Branches
- `release/v18-stable` — v18 production release (NEVER force-push, NEVER delete)
- `release/v17-stable` — v17 production release (NEVER force-push, NEVER delete)
- Tag `v18-stable` — points to commit e591b27 (v18 final)
- Tag `v17-stable` — points to commit a5c8a4c (v17 Phase 4 final)

## Git Protection Configuration
- `receive.denyNonFastForwards = true` — prevents force-push that rewrites history
- `receive.denyDeletes = true` — prevents branch/tag deletion
- `branch.autosetupmerge = false` — explicit merge configuration

## Rollback Prevention
1. NEVER run `git reset --hard` on main/release branches
2. NEVER run `git push --force` on main/release branches
3. If a fix is needed, create a NEW commit (don't rewrite history)
4. If a rollback is truly needed, require 3-of-5 multisig approval + create a "revert" commit (not a reset)

## Backup Verification
- Total commits: 332
- Total files at HEAD: 2390
- Prisma models: 402
- API routes: 1560
- Lib files: 489
- Pages: 16

## Disaster Recovery
1. To restore from backup: `git checkout release/v18-stable`
2. To verify integrity: `git fsck --connectivity-only`
3. To compare against backup: `git diff release/v18-stable..HEAD --stat`
