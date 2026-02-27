# Phase 6 — StepConfigModal.tsx Refactoring Plan

## Current State
- **File Size**: 2,322 lines
- **Issue**: All service configurations in a single monolithic component
- **Maintenance Risk**: High — any bug fix requires changes in multiple places

## Refactoring Strategy

The component should be split into per-service sub-components following the pattern already established in `NotionStepConfig.tsx`:

### Service Sub-Components to Create

1. **EmailStepConfig.tsx** (~150 lines)
   - Recipient field
   - Subject field
   - Body field with markdown preview
   - Retry config
   - Variable picker integration

2. **SMSStepConfig.tsx** (~100 lines)
   - Phone number field
   - Message body
   - Retry config

3. **WhatsAppStepConfig.tsx** (~100 lines)
   - Phone number field (WhatsApp format)
   - Message body
   - Retry config

4. **WebhookStepConfig.tsx** (~200 lines)
   - URL field with SSRF validation
   - Method selector (GET/POST/PUT/PATCH/DELETE)
   - Headers editor
   - Body editor (JSON/form)
   - Retry config
   - Response handling

5. **FilterStepConfig.tsx** (~150 lines)
   - Condition editor
   - Operator selector
   - Value input
   - Else path step selector
   - On-fail behavior (stop vs else_steps)

6. **FormatterStepConfig.tsx** (~100 lines)
   - Format type selector
   - Input/output field configuration
   - Preview

7. **DelayStepConfig.tsx** (~80 lines)
   - Amount input
   - Unit selector (seconds/minutes/hours/days)

8. **SheetStepConfig.tsx** (~150 lines)
   - Spreadsheet ID input
   - Action selector
   - Row/column mapping
   - Retry config

### Main Component Changes

The refactored `StepConfigModal.tsx` would:

```typescript
// Import all sub-components
import { EmailStepConfig } from "./services/EmailStepConfig";
import { SMSStepConfig } from "./services/SMSStepConfig";
import { WebhookStepConfig } from "./services/WebhookStepConfig";
import { NotionStepConfig } from "./services/NotionStepConfig";
import { FilterStepConfig } from "./services/FilterStepConfig";
// ... etc

// Simplified renderForm()
const renderForm = () => {
  const props = { config: formData, onChange: setFormData, clientId, prevSteps };

  switch (service) {
    case 'email':
      return <EmailStepConfig {...props} />;
    case 'sms':
      return <SMSStepConfig {...props} />;
    case 'whatsapp':
      return <WhatsAppStepConfig {...props} />;
    case 'webhook':
      return <WebhookStepConfig {...props} />;
    case 'notion':
      return <NotionStepConfig action={action} {...props} />;
    case 'filter':
      return <FilterStepConfig {...props} />;
    case 'delay':
      return <DelayStepConfig {...props} />;
    case 'sheets':
      return <SheetStepConfig {...props} />;
    default:
      return null;
  }
};
```

### Benefits

1. **Testability**: Each component can be tested in isolation
2. **Maintainability**: Changes to one service don't affect others
3. **Reusability**: Sub-components can be used elsewhere
4. **Performance**: Easier to implement code splitting
5. **Onboarding**: New developers can understand service configs independently

### Folder Structure

```
src/components/workflow/
├── StepConfigModal.tsx (cleaned up, ~200 lines)
├── ExecutionDetailDrawer.tsx
├── services/
│   ├── EmailStepConfig.tsx
│   ├── SMSStepConfig.tsx
│   ├── WhatsAppStepConfig.tsx
│   ├── WebhookStepConfig.tsx
│   ├── NotionStepConfig.tsx (✅ completed)
│   ├── FilterStepConfig.tsx
│   ├── DelayStepConfig.tsx
│   └── SheetStepConfig.tsx
└── shared/
    ├── VariablePicker.tsx (extracted from StepConfigModal)
    └── RetryConfig.tsx (common retry UI)
```

### Implementation Time Estimate

- Each sub-component: 15-20 minutes
- Main component refactor: 10-15 minutes
- Testing: 30 minutes
- **Total**: ~3 hours for complete refactoring

### Next Steps

1. Create the `services/` folder
2. Extract each service configuration into its own component
3. Move `VariablePicker` to `shared/VariablePicker.tsx`
4. Create `shared/RetryConfig.tsx` for common retry UI
5. Simplify main `StepConfigModal.tsx` to route to sub-components
6. Test all services to ensure functionality is preserved
7. Commit with message: "Phase 6: Refactor StepConfigModal into per-service sub-components"

### Pattern Example

See `src/components/workflow/NotionStepConfig.tsx` for the established pattern.

---

**Status**: Refactoring pattern established. Ready for component extraction in next phase.
