# Vernex Hub
Client portal for Vernex Digital Marketing. Spec: docs/PRD.md.
Stack: Vite + React + TypeScript + Tailwind, React Router, TanStack Query.
Frontend first on a mock data layer; Supabase replaces it later.
Rules:
- Screens import data only from src/lib/queries, never src/data.
- Permissions only through useCan() from src/lib/permissions.ts. No role
  checks inside components.
- Admin roles (vernex_founder, vernex_pm) create, edit, delete clients,
  client users, projects, milestones, deliverables, invoices.
- Client roles (client_admin, client_member) only view their own client,
  plus: approve or request revision (client_member only if can_approve),
  service requests, Brand Assets upload, comments, Founder Box.
- Clients never see internal items, leads, or other clients.
- Tokens from src/styles/tokens.css only. No gradients, shadows, glow,
  Inter, or emoji icons. Money as ₹ in paise; dates in IST.
