# CLAUDE.md — pos-frontend

Guidance for Claude Code (and any AI agent) working in this repository.

## Golden Rule — ASK, DON'T ASSUME

**Never assume requirements.** Before writing any code:

- If the task is ambiguous, under-specified, or missing context (which page/flow is affected — `MODO_CAJA_SIMPLE` or the normal vendedor flow, or both? should this be admin-only or visible to cashiers too? what's the exact UX when the request fails?), **stop and ask**.
- If there are multiple reasonable ways to implement something (e.g. optimistic UI update vs. refetch, localStorage vs. a new backend config field, a new page vs. a section in an existing one), **present the options and ask which one the user wants** instead of silently picking one.
- It is always better to ask one extra question than to build the wrong thing. Do not treat "I can guess a reasonable default" as permission to skip asking — only proceed without asking when the request is fully unambiguous and scoped.
- This applies even to small-sounding tasks — a UI tweak can hide a scoping decision (does this apply to both cashier modes? does it need a backend field, or is it purely local state?).

## Required Workflow

For any non-trivial change, follow these steps in order:

1. **Analyze the problem.** Read the relevant page/component/hook before proposing anything. Check whether the backend (`pos-backend`) needs a matching change (new config field, new endpoint, new response shape) — frontend and backend usually move together in this project.
2. **Write a detailed, step-by-step plan** describing exactly what will change and where (files, components, state, API calls).
3. **Ask for approval of the plan** before writing code — and per the Golden Rule, if the plan itself depends on an ambiguous decision, ask that question as part of this step rather than picking an option silently.
4. **Implement**, then **verify it actually works** in the browser: restart/reload the dev server, open the actual flow, and exercise the golden path **and edge cases** — don't just claim it's done because the code compiles or HMR applied without errors.
5. **Get an independent review.** After the implementation is complete, have another agent (a fresh subagent, not the same context that wrote the code) review the diff against the original problem statement and the approved plan — not just "does this compile" but "does this actually solve what was asked, and does it match the plan." Give that reviewing agent the problem description and the plan as context so it can judge correctness, not just style.

Do not skip straight from "task received" to "code written."

## Tech Stack

- **Framework:** React 18 + TypeScript, built with [Vite 5](https://vitejs.dev/).
- **Routing:** `react-router-dom` v7 (`src/App.tsx`).
- **Styling:** Tailwind CSS (utility classes inline in JSX — no CSS modules/styled-components).
- **HTTP client:** `axios` via a single shared instance, `src/api/axiosClient.ts` — attaches `Authorization: Bearer <token>` from `localStorage` on every request, and on a `401` response clears the session (`token`, `pos_rol`, `sesion_caja`, `pos_vendedor`) and redirects to `/login`.
- **Icons:** `lucide-react`. **Toasts:** `sonner`. **CSV:** `papaparse`.
- **Auth state:** `src/context/AuthContext.tsx` + `src/components/ProtectedRoute.tsx` — role is `ADMIN` or `EMPLEADO`, persisted in `localStorage`.
- **Pages (`src/pages/`):** `Login`, `Dashboard` (admin-only: stats, config toggles), `NuevaVenta` (cart/comanda building), `Caja` (cashier session: cobrar/anular/cerrar turno), `HistorialVentas` (ticket history + ARCA invoice retry), `Inventario` (stock/product management).
- **Dev server:** `npm run dev` (Vite on `http://localhost:5173`). **Build:** `npm run build` (`tsc -b && vite build`). **Lint:** `npm run lint`.

## Key Domain Concept: `MODO_CAJA_SIMPLE`

A backend-driven feature flag (`GET /api/config` → `modoCajaSimple: boolean`, `cajaId`) that changes the cashier flow:
- No vendedor selector — each cashier works under their own `SesionCaja`.
- Session state lives in `localStorage` under `sesion_caja`: `{ abierta, cajero, caja_id, sesion_id }`.
- Several pages (`NuevaVenta`, `Caja`) branch their behavior on `modoCajaSimple` — **when changing one of these pages, always check whether the change needs to work correctly under both modes**, not just the one you're actively testing.
- `NuevaVenta` initializes `modoCajaSimple` synchronously from `localStorage` (not just from the async `/config` fetch) — this avoids a race where cart-sync logic runs before the config response lands. Keep this pattern in mind when touching related state.

## Testing Expectations

- For any UI/flow change, actually use it in the browser before reporting done: golden path **and** edge cases (empty states, error responses, switching between `MODO_CAJA_SIMPLE` and normal mode where relevant).
- Type-checking passing is not the same as the feature working — verify in-browser behavior explicitly.
