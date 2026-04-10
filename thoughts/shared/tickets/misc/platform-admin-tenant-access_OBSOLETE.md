# OBSOLETE — superseded by 2026-04-09 Platform Admin System

Plan:     thoughts/shared/plans/2026-04-09-platform-admin-system.md
Research: thoughts/shared/research/2026-04-09-platform-admin-system.md

The `platform_admins` flag-table approach proposed here was rejected in
favour of a fully separated auth domain (own PlatformUser table, own JWT,
mandatory MFA, no userTenants bypass, consent-based impersonation).
