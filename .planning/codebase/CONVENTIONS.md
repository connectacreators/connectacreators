# Coding Conventions

**Analysis Date:** 2026-03-10

## Naming Patterns

**Files:**
- Components: PascalCase (e.g., `AIScriptWizard.tsx`, `ThemeToggle.tsx`)
- Hooks: camelCase with `use` prefix (e.g., `useScripts.ts`, `useAuth.ts`, `useClients.ts`)
- Services: camelCase with `Service` suffix (e.g., `scriptService.ts`, `aiGenerator.ts`)
- Pages: PascalCase (e.g., `Scripts.tsx`, `Dashboard.tsx`, `ClientDetail.tsx`)
- UI components: lowercase with hyphens (e.g., `button.tsx`, `dialog.tsx`, `select.tsx`)

**Functions:**
- camelCase for all regular functions: `fetchClients()`, `handleSubmit()`, `toggleTheme()`
- Arrow functions preferred for callbacks and inline handlers
- Type guards and utilities: camelCase (e.g., `interpolateVariables()`, `replaceAllLines()`)

**Variables:**
- camelCase for all variables: `loading`, `activeFolder`, `clientId`, `sidebarOpen`
- State variables use descriptive names: `isPasswordRecovery`, `isStaff`, `showClientSelector`
- Boolean prefixes: `is`, `has`, `show`, `can` (e.g., `isAdmin`, `hasError`, `showModal`, `canDelete`)
- Database field mappings: snake_case matching Supabase columns (e.g., `user_id`, `client_id`, `created_at`)

**Types:**
- Interfaces: PascalCase (e.g., `AuthContextType`, `WorkflowStep`, `ScriptLine`)
- Type aliases: PascalCase (e.g., `Client`, `Script`, `UserRole`)
- Enums: UPPERCASE (e.g., `type UserRole = "admin" | "user" | "client"`)
- Generic types: Single letters or descriptive PascalCase (e.g., `T`, `StepExecutionResult`)

## Code Style

**Formatting:**
- ESLint + TypeScript ESLint for linting
- No explicit Prettier config (eslint.config.js handles styling)
- Tab width: 2 spaces (inferred from package.json and existing code)
- Line length: No hard limit enforced (estimated ~100-120 characters preferred)
- Semicolons: Required at end of statements
- Trailing commas: Enabled in objects/arrays

**Linting:**
- Config file: `eslint.config.js` (line 1-29)
- Rules enforced:
  - `@typescript-eslint/no-unused-vars`: OFF (rule disabled for flexibility)
  - `react-refresh/only-export-components`: WARN (enforces component exports)
  - ESLint recommended rules active
  - React Hooks rules enforced
- Ignored paths: `/dist/` directory
- No prettier config detected (formatting handled by ESLint rules)

## Import Organization

**Order:**
1. React imports: `import React from "react"` and `import { useState, ... } from "react"`
2. Third-party UI libraries: `@radix-ui/*`, `lucide-react`
3. Custom components: `@/components/...`
4. Hooks: `@/hooks/...`
5. Utilities/lib: `@/lib/...`, `@/integrations/...`
6. Types/contexts: `@/contexts/...`, type imports
7. External services: `sonner` (toast), external APIs
8. Relative imports: For sibling files (rare)

**Path Aliases:**
- `@/*` resolves to `./src/*` (tsconfig.json line 8-10)
- Always use `@/` prefix for imports within src directory
- Examples: `@/components/ui/button`, `@/hooks/useAuth`, `@/integrations/supabase/client`

**Example import block** (from `src/pages/Scripts.tsx`):
```typescript
import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Film, Mic, Scissors, Sparkles, ... } from "lucide-react";
import { useTheme } from "@/hooks/useTheme";
import { useLanguage } from "@/hooks/useLanguage";
import { t, tr } from "@/i18n/translations";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
```

## Error Handling

**Patterns:**
- Try-catch blocks in async functions: Errors logged with `console.error()` then rethrown or handled gracefully
- Toast notifications for user-facing errors: `toast.error("User-friendly message")`
- Silent logging for non-critical failures: `console.error()` without user toast
- Supabase errors: Extract with `if (error) { console.error(error); ... }`
- No global error boundary detected (individual component error handling only)

**Examples** (from `src/hooks/useClients.ts`):
```typescript
const { data, error } = await supabase.from("clients").select("*");
if (error) {
  toast.error("Error loading clients");
  console.error(error);
} else {
  setClients(data || []);
}
```

**Edge Function Patterns** (from `supabase/functions/execute-workflow/index.ts`):
```typescript
async function handleEmailStep(...): Promise<StepExecutionResult> {
  const startTime = Date.now();
  try {
    // ... operation
    return { step_id, service, status: 'completed', output, duration };
  } catch (error) {
    return { step_id, service, status: 'failed', error: String(error), duration };
  }
}
```

## Logging

**Framework:** `console` (native browser API)

**Patterns:**
- `console.error()`: For failures and debugging (e.g., failed API calls, data errors)
- `console.log()`: For informational messages (rare, mostly during development)
- Structured logs in edge functions: JSON format with `level` field (e.g., `console.log(JSON.stringify({ level: 'email', ... }))`)
- No Winston, Bunyan, or other logging library detected
- No centralized logger utility

**Examples** (from `src/hooks/useClients.ts`):
```typescript
console.error("Error loading clients");
console.error(error);
```

**In edge functions** (from `supabase/functions/execute-workflow/index.ts`):
```typescript
console.log(JSON.stringify({
  level: 'email',
  to,
  subject,
  body: body.substring(0, 200),
  timestamp: new Date().toISOString(),
}));
```

## Comments

**When to Comment:**
- High-level workflow explanations above complex functions
- Non-obvious business logic (e.g., database constraint workarounds)
- Critical state management decisions
- TODO/FIXME annotations with specific action items
- NOT used for obvious code (no comments explaining `const x = 1`)

**Section Headers:**
Used in edge functions to organize code blocks:
```typescript
// ==================== TYPES ====================
// ==================== STEP OUTPUT SCHEMAS ====================
// ==================== VARIABLE INTERPOLATION ====================
// ==================== STEP HANDLERS ====================
```

**JSDoc/TSDoc:**
- Not consistently used throughout codebase
- TypeScript interfaces provide implicit documentation
- Function parameters typed with `Record<string, any>` instead of detailed JSDoc

**Example** (from `src/hooks/useScripts.ts` line 36-43):
```typescript
// Fire-and-forget Notion sync helper
const syncToNotion = async (params: {
  script_id: string;
  client_id: string;
  title: string;
  google_drive_link?: string | null;
  action: "create" | "update";
}) => {
```

## Function Design

**Size:**
- Small utility functions: 5-15 lines (e.g., `cn()` in `src/lib/utils.ts`)
- Hook functions: 50-150 lines (e.g., `useClients()`, `useScripts()`)
- Component functions: 100-400 lines for larger pages (e.g., `Scripts.tsx` at 700+ lines)
- No hard limit enforced; complexity guides when to split
- Long async operations extracted to helper functions

**Parameters:**
- Destructuring preferred: `{ name, email, ...updates }`
- Optional parameters with defaults: `(enabled: boolean, ownerScoped?: boolean)`
- Complex configs use typed object params: `config: Record<string, any>`
- Avoid positional params for clarity; named parameters preferred

**Return Values:**
- Explicit return types in function signatures (e.g., `Promise<Script>`, `React.ReactNode`)
- Async functions return objects with `{ data, error }` pattern (Supabase style)
- Hooks return objects with multiple values: `{ clients, loading, addClient, updateClient, refetch }`
- Components return JSX (no Fragment wraps without semantic need)

**Examples** (from `src/hooks/useClients.ts`):
```typescript
export function useClients(enabled: boolean, ownerScoped?: boolean) {
  // ... implementation
  return { clients, loading, addClient, updateClient, refetch: fetchClients };
}
```

## Module Design

**Exports:**
- Named exports for utilities and types: `export function useClients()`, `export type Client`
- Default export for React components: `export default function Scripts()`
- Re-exports from centralized indexes: `export { useAuth } from "@/contexts/AuthContext"`
- Services exported as object: `export const scriptService = { createScript, getScriptsByClient, ... }`

**Barrel Files:**
- Not heavily used; import directly from source files
- Used in `src/integrations/supabase/` for cleaner API exposure
- Example: `src/integrations/supabase/client.ts` exports configured Supabase instance

**Service Pattern:**
Used for data layer (from `src/services/scriptService.ts`):
```typescript
export const scriptService = {
  async createScript(data: CreateScriptInput): Promise<Script> { ... },
  async getScriptsByClient(clientId: string): Promise<Script[]> { ... },
  async updateScript(scriptId: string, updates: UpdateScriptInput): Promise<Script> { ... },
  async deleteScript(scriptId: string): Promise<void> { ... },
};
```

## State Management

**Patterns:**
- React Context for global state: `AuthContext`, `LeadNotificationContext`
- useState for local component state (no Redux/Zustand)
- useCallback for memoized callbacks to prevent re-renders
- useEffect for side effects with proper cleanup
- useMemo for expensive computations

**Example** (from `src/contexts/AuthContext.tsx`):
```typescript
const [user, setUser] = useState<User | null>(null);
const [role, setRole] = useState<UserRole>("client");
const [loading, setLoading] = useState(true);

useEffect(() => {
  // ... side effect with cleanup
  return () => {
    isMounted = false;
    subscription.unsubscribe();
  };
}, []);
```

**Async Operations:**
- No React Query or SWR detected
- Supabase client directly used in hooks with manual state management
- Fetch operations wrapped in try-catch with error toast notifications

## TypeScript Patterns

**Strict Mode:**
- `noImplicitAny`: FALSE (allows implicit `any` type)
- `noUnusedParameters`: FALSE (unused params allowed)
- `strictNullChecks`: FALSE (null checks not enforced)
- `noUnusedLocals`: FALSE (unused locals allowed)
- `skipLibCheck`: TRUE (skip type checking of declaration files)
- `allowJs`: TRUE (JavaScript allowed alongside TypeScript)

**Type Definitions:**
- Inline type definitions for simple types (e.g., `type FolderKey = "content" | "sales" | "setup"`)
- Interface definitions for complex objects (e.g., `interface AuthContextType`)
- Type imports: `import type { User } from "@supabase/supabase-js"`
- Generic types used for reusable interfaces: `Record<string, any>` for flexible objects

**Example** (from `src/pages/Dashboard.tsx`):
```typescript
type FolderKey = "content" | "sales" | "setup";
const [activeFolder, setActiveFolder] = useState<FolderKey | null>(null);
```

## React Patterns

**Functional Components:**
- All components are functional (no class components)
- Arrow function export: `export default function ComponentName() { ... }`
- Hooks used throughout for state and effects

**Memo & Performance:**
- useCallback used to wrap event handlers and async functions
- useMemo used for derived state (e.g., `isStaff = isAdmin || isVideographer`)
- No React.memo or React.lazy detected (not aggressively optimizing)

**Event Handling:**
- onClick, onChange, onSubmit handlers prefixed with `handle` (e.g., `handleSubmit`, `handleChange`)
- Inline arrow functions for simple callbacks
- Named functions for complex handlers

**Example** (from `src/components/ThemeToggle.tsx`):
```typescript
const ThemeToggle = () => {
  const { theme, toggleTheme } = useTheme();
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={toggleTheme}
      className="h-8 w-8 p-0"
    >
      {theme === "dark" ? <Sun /> : <Moon />}
    </Button>
  );
};
```

## UI Component Library

**Framework:** shadcn/ui (Radix UI primitives with Tailwind styling)

**Pattern:**
- Components in `src/components/ui/` follow shadcn conventions
- Use CVA (class-variance-authority) for variant management
- Forwardref for DOM element access: `React.forwardRef<HTMLButtonElement, ButtonProps>`
- Slot pattern for component composition: `asChild` prop from Radix

**Example** (from `src/components/ui/button.tsx`):
```typescript
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2...",
  {
    variants: {
      variant: { default: "btn-17-primary", destructive: "btn-17-destructive", ... },
      size: { default: "h-10 px-5 py-2", sm: "h-9 px-4...", ... },
    },
  }
);

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
  }
);
```

## Styling

**Framework:** Tailwind CSS

**Custom Classes:**
- CSS variables for theming in `src/index.css` (HSL-based color system)
- Custom utilities: `btn-17-primary`, `btn-17-hero`, `btn-17-secondary`
- Gradient utilities: `--gradient-primary`, `--gradient-hero`
- Transition utilities: `--transition-smooth`, `--transition-bounce`

**Theme Variables** (from `src/index.css`):
```css
:root {
  --primary: 43 74% 49%;           /* Gold */
  --secondary: 0 0% 0%;            /* Black */
  --muted: 0 0% 17%;               /* Dark gray */
  --background: 0 0% 10%;          /* Very dark */
  --radius: 0.75rem;               /* Border radius */
}
```

**Pattern:**
- Tailwind utility classes for layout and spacing
- Custom CSS vars for theme-aware colors
- No CSS modules detected
- Global styles in `src/App.css` and `src/index.css`

## Translation/Internationalization

**Pattern:** Custom translation function in `src/i18n/translations.ts`

**Usage:**
- `t` object contains all translation strings
- `tr(translationKey, language)` function returns translated string
- Supported languages: `"en" | "es"`
- Language context: `useLanguage()` hook provides `language` and `setLanguage()`

**Example** (from `src/pages/Scripts.tsx`):
```typescript
import { t, tr } from "@/i18n/translations";
const { language } = useLanguage();

const label = tr(t.scripts.filmingInstructions, language);
```

---

*Convention analysis: 2026-03-10*
