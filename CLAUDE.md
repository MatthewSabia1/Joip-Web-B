# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Development Commands
- `npm run dev` - Start the development server
- `npm run build` - Build for production
- `npm run lint` - Run ESLint on TypeScript and TSX files
- `npm run preview` - Preview the production build
- `npm run typecheck` - Check TypeScript types (add this to package.json if needed)
- `npm run reset-db` - Reset Supabase database (if using Supabase)
- `npm run migrate` - Run Supabase migrations (if using Supabase)
- `npm test` - Run a single test (use Jest or Vitest with `-- -t "test name"`)

## Code Style Guidelines
- **TypeScript**: Strict mode with noUnusedLocals and noUnusedParameters enabled
- **React**: Functional components with hooks; prefer named exports
- **Imports**: Group imports (external packages first, then internal modules); use ESM format
- **Naming**: PascalCase for components/types, camelCase for variables/functions
- **Formatting**: Follow existing patterns; use 2 space indentation
- **Error Handling**: Use try/catch for async operations
- **State Management**: React hooks for local state, context API or React Query for shared state
- **Styling**: Use Tailwind CSS with component-based patterns
- **Testing**: Write unit tests for utility functions and components when applicable