

## Client Account Verification Status

### What will change

When an admin creates a client with an email (e.g., "Dr Calvin's Clinic" with email drcalvinsclinic@gmail.com), the client card will show a small red "no verificado" label next to the name until that person creates an account with the same email. Once they register and sign in, the system automatically links the account (this already works via the existing database trigger), and the label disappears.

### Steps

1. **Update the client list UI in `src/pages/Scripts.tsx`** -- Next to each client name, check if `user_id` is `null`. If so, render a small red "no verificado" text. Once the client registers with the matching email, `user_id` gets populated automatically and the label goes away.

2. **Update the client detail header** -- Same indicator in the client detail view so admins always see the verification status.

No database changes needed -- the `handle_new_user` trigger already runs `UPDATE public.clients SET user_id = NEW.id WHERE email = NEW.email AND user_id IS NULL`, which handles the automatic merge when a user signs up with a matching email.

### Technical Details

- In the client card (around line 613-615 of `Scripts.tsx`), add a conditional `<span>` after the client name:
  ```tsx
  <p className="font-semibold text-foreground truncate">
    {c.name}
    {!c.user_id && (
      <span className="text-xs text-red-500 font-normal ml-2">no verificado</span>
    )}
  </p>
  ```

- Files modified: `src/pages/Scripts.tsx` only (two spots: client list card + client detail breadcrumb/header area)

