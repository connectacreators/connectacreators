# Testing Patterns

**Analysis Date:** 2026-03-10

## Test Framework

**Status:** No automated testing framework detected in codebase

**Runner:**
- Not configured (no Jest, Vitest, Playwright, or Cypress found)
- No test files in `src/` directory (`.test.ts`, `.spec.ts` not present)
- No testing dependencies in package.json (no jest, vitest, @testing-library)

**Build/Dev Tools:**
- ESLint available (`npm run lint`)
- TypeScript compilation for type safety (`npm run build`)
- No automated test commands in package.json

**Manual Testing Approach:**
- QA appears manual (testing done by running app in browser)
- Development mode: `npm run dev` (Vite dev server on port 8080)
- Build verification: `npm run build` followed by visual inspection

## Testing Patterns in Edge Functions

**Type Safety:**
Edge functions use TypeScript with explicit type definitions to catch errors at compile time.

**Example** (from `supabase/functions/execute-workflow/index.ts` lines 9-33):
```typescript
interface WorkflowStep {
  id: string;
  type: string;
  service: string;
  action?: string;
  config: Record<string, any>;
}

interface StepExecutionResult {
  step_id: string;
  service: string;
  action?: string;
  status: 'completed' | 'failed' | 'skipped';
  output?: Record<string, any>;
  error?: string;
  duration?: number;
}

interface ExecutionContext {
  workflow_id: string;
  client_id: string;
  trigger_data: Record<string, any>;
  steps: WorkflowStep[];
}
```

**Error Handling & Logging:**
Functions return explicit result objects with status and error fields for client-side error handling.

```typescript
async function handleEmailStep(...): Promise<StepExecutionResult> {
  const startTime = Date.now();
  try {
    // ... operation
    return {
      step_id: config.step_id || '',
      service: 'email',
      action: 'send_email',
      status: 'completed',
      output: { sent_to: to },
      duration: Date.now() - startTime,
    };
  } catch (error) {
    return {
      step_id: config.step_id || '',
      service: 'email',
      status: 'failed',
      error: String(error),
      duration: Date.now() - startTime,
    };
  }
}
```

**Unit-Like Testing in Code:**
Functions validate inputs before processing:

```typescript
if (!to) {
  return {
    step_id: config.step_id || '',
    service: 'email',
    action: 'send_email',
    status: 'failed',
    error: 'No recipient email address provided',
    duration: Date.now() - startTime,
  };
}
```

## Testing in React Components

**Pattern: Manual State Testing**
Components use console.log for debugging state changes during development.

**Example** (from `src/contexts/AuthContext.tsx` line 51):
```typescript
console.log("[AuthProvider] onAuthStateChange:", event, "user:", session?.user?.email ?? "null");
```

**Testing Workflow Steps:**
Visual feedback via UI components (`test-workflow-step` edge function used for manual testing).

**Example UI Test Pattern** (from MEMORY.md):
```
Test panel in StepConfigModal.tsx:
- "Test This Step" section at bottom of non-trigger steps
- Shows trigger data source (real lead or mock data)
- "Run Test" button with Play icon and loading spinner
- Test results display: status (green/red/yellow), duration, output, error
```

## TypeScript for Type Safety

**Strategy:** Leverage TypeScript strict types instead of unit tests

**Type Checking:**
- Explicit function parameter types: `(clientId: string, updates: { name?: string; email?: string | null })`
- Explicit return types: `Promise<Script>`, `boolean`, `Record<string, any>`
- Interface definitions for complex objects

**Example** (from `src/services/scriptService.ts` lines 3-24):
```typescript
export interface Script {
  id: string;
  client_id: string;
  title: string;
  content: string;
  template: boolean;
  google_drive_link: string | null;
  created_at: string;
}

export interface CreateScriptInput {
  client_id: string;
  title: string;
  content: string;
  template?: boolean;
}

export interface UpdateScriptInput {
  title?: string;
  content?: string;
  template?: boolean;
}
```

## Validation Patterns

**Form Validation:**
Zod schema validation (library included in package.json: `"zod": "^3.23.8"`)

**Pattern:** Schemas likely used in forms but not isolated as testable validators.

**Data Validation in Hooks:**
Simple existence checks before processing:

```typescript
const { data, error } = await supabase.from("clients").select("*");
if (error) {
  toast.error("Error loading clients");
  console.error(error);
} else {
  setClients(data || []);
}
```

**Null/undefined Guards:**
Optional chaining and nullish coalescing used throughout:

```typescript
const to = interpolateVariables(config.to, triggerData, stepContext);
const zohoEmail = config.zoho_email;
const zohoPassword = config.zoho_password;

if (!to) {
  return { ... status: 'failed', error: 'No recipient email address provided' };
}
```

## Environment Testing

**Development Mode:**
```bash
npm run dev
```
- Starts Vite dev server on `::` port 8080
- Hot module reloading enabled
- React component tagger enabled in development mode

**Build Testing:**
```bash
npm run build
```
- Vite production build
- TypeScript type checking during build
- Minification and optimization applied

**Code Quality:**
```bash
npm run lint
```
- ESLint runs across all TypeScript/JavaScript files
- `no-unused-vars` rule disabled (allows dead code, flexible for experimentation)
- React hooks rules enforced
- React refresh component exports warned

## Missing Testing Infrastructure

**Gaps:**
1. No unit test framework (Jest, Vitest)
2. No component test framework (@testing-library/react)
3. No E2E testing (Cypress, Playwright)
4. No snapshot testing
5. No integration test suite
6. No test coverage reporting (no C8 or Istanbul)
7. No mocking libraries (MSW, jest.mock)
8. No test data factories or fixtures

**Risk Areas Without Tests:**
- Complex hook logic (`useScripts`, `useAuth`, `useClients`)
- API layer integrations (Supabase client calls)
- Workflow execution engine (`supabase/functions/execute-workflow/`)
- State management edge cases
- Error handling paths
- Form validation logic

## Regression Prevention

**Current Strategy:**
- TypeScript strict mode (partial - nullChecks disabled)
- ESLint rules prevent common mistakes
- Manual QA via browser testing
- Code review via git (assumed)

**No Automated Regression Detection:**
- Changes to critical paths rely on manual testing
- No CI/CD pipeline test gate detected
- Risk of breaking changes going undetected

## Testing Recommendations for Future Development

**If Testing Framework Added:**

**Suggested Structure:**
```
src/
├── __tests__/
│   ├── hooks/
│   │   ├── useScripts.test.ts
│   │   ├── useAuth.test.ts
│   │   └── useClients.test.ts
│   ├── services/
│   │   ├── scriptService.test.ts
│   │   └── aiGenerator.test.ts
│   └── components/
│       └── AIScriptWizard.test.tsx
supabase/functions/
├── __tests__/
│   ├── execute-workflow.test.ts
│   └── test-workflow-step.test.ts
```

**Test Pattern for Hooks:**
```typescript
import { renderHook, act } from '@testing-library/react';
import { useScripts } from '@/hooks/useScripts';

describe('useScripts', () => {
  it('should fetch scripts for client', async () => {
    const { result } = renderHook(() => useScripts());

    await act(async () => {
      await result.current.fetchScriptsByClient('client-id-123');
    });

    expect(result.current.scripts).toBeDefined();
  });
});
```

**Test Pattern for Services:**
```typescript
import { scriptService } from '@/services/scriptService';

describe('scriptService', () => {
  it('should create a script', async () => {
    const input = { client_id: 'c1', title: 'Test', content: 'content' };
    const result = await scriptService.createScript(input);
    expect(result.id).toBeDefined();
  });
});
```

**Test Pattern for Edge Functions:**
```typescript
import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { handleEmailStep } from './index.ts';

Deno.test('Email step should fail without recipient', async () => {
  const result = await handleEmailStep(
    { step_id: 's1', to: '' },
    { name: 'Test' },
    new Map()
  );
  assertEquals(result.status, 'failed');
});
```

## Code Quality Tools

**Available:**
- ESLint (configured in `eslint.config.js`)
- TypeScript compiler (tsconfig.json enforces partial type safety)
- Vite (fast builds, detects syntax errors)

**Not Available:**
- Code coverage measurement
- Performance profiling
- Bundle analysis
- Security scanning (no SAST)

---

*Testing analysis: 2026-03-10*

## Note on Testing Philosophy

This codebase prioritizes **rapid development and iteration** over comprehensive test coverage. The approach relies on:

1. **TypeScript for type safety** - Prevents many runtime errors at compile time
2. **Manual QA** - Core functionality verified by human testing before deployment
3. **Simple error handling** - Failed operations return explicit error status objects
4. **Isolated edge functions** - Each Supabase function has clear inputs/outputs reducing dependencies
5. **UI-based validation** - Test panels in components (e.g., `TestRunModal`, `StepConfigModal`) allow manual step-by-step verification

This is appropriate for a **startup/agency tool** where velocity and feature delivery matter more than maximal test coverage. As the product scales, consider adding tests for:
- Critical paths (authentication, payments, data persistence)
- Complex calculations (workflow execution, script generation)
- External API integrations (Supabase, Stripe, Notion, Twilio)
