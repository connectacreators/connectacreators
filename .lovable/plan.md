

# Fix Timezone Mismatch + Add Zapier Webhook

## Problem
The `public-booking` edge function uses `new Date(dateVal).getHours()` (line 137) which returns **UTC hours** on the server. But slot generation uses `start_hour`/`end_hour` which are in the **client's local timezone** (e.g. America/Denver = MST, UTC-7). A 10:30 AM MST appointment returns hour 17 in UTC, so the overlap check never matches and the slot stays "available."

## Changes

### 1. Fix timezone in `public-booking` edge function
- Replace `d.getHours() + d.getMinutes() / 60` with `Intl.DateTimeFormat` using `settings.timezone` to extract local hours/minutes
- This ensures busy slot detection matches the same timezone as slot generation

### 2. Store booking datetime with explicit timezone offset
- When creating a booking (POST), compute the proper ISO offset for the client's timezone and append it to the datetime sent to Notion (e.g. `2026-02-19T10:30:00.000-07:00` for MST)
- This ensures Notion stores the time unambiguously so the lead calendar also reads it correctly

### 3. Add `zapier_webhook_url` column to `booking_settings`
- New nullable TEXT column
- No RLS changes needed (existing policies cover it)

### 4. Send webhook after booking creation
- After successfully creating the Notion page, if `zapier_webhook_url` is set, POST all booking data (name, email, phone, message, date, time, client name) to that URL
- Fire-and-forget (don't block the response)

### 5. Add Zapier Webhook input in BookingSettings UI
- New input field in the settings page for the webhook URL
- Included in the save payload

### 6. Set Dr. Calvin's webhook via SQL
- Insert/update the webhook URL `https://hooks.zapier.com/hooks/catch/26299881/ue5dt3f/` for the client whose booking settings page you're currently viewing (client ID `3b26679f-9ac1-437a-bb71-4d3107992d83`)

---

## Technical Details

### Timezone fix (edge function, busy slot extraction)
```text
// BEFORE (broken - returns UTC hours):
const d = new Date(dateVal);
const hourDec = d.getHours() + d.getMinutes() / 60;

// AFTER (correct - returns hours in client's timezone):
const d = new Date(dateVal);
const fmt = new Intl.DateTimeFormat("en-US", {
  timeZone: settings.timezone,
  hour: "numeric", minute: "numeric", hour12: false
});
const parts = fmt.formatToParts(d);
const localH = Number(parts.find(p => p.type === "hour")?.value);
const localM = Number(parts.find(p => p.type === "minute")?.value);
const hourDec = localH + localM / 60;
```

### Timezone fix (edge function, booking creation)
```text
// Compute UTC offset for the client's timezone at the booking time
// Then store as e.g. "2026-02-19T10:30:00.000-07:00" so Notion knows the exact moment
```

### Webhook call (after Notion page created)
```text
if (settings.zapier_webhook_url) {
  fetch(settings.zapier_webhook_url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, email, phone, message, date, time, client_name: clientNotionName })
  }).catch(err => console.error("Zapier webhook failed:", err));
}
```

### BookingSettings UI
- New "Zapier Webhook URL" input field below the break times section
- Saved alongside all other settings

