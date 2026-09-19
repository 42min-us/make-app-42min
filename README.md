# 42min app for Make

The source of the [42min](https://42min.us) custom app for [Make](https://www.make.com),
kept as code and pushed to Make through its SDK Apps API.

42min is online meeting scheduling: booking pages, availability, routing and
reminders. This app lets a Make scenario check availability, create and manage
bookings, and read event types over the [public 42min API](https://42min.us/help/api).

## Modules

| Module | Type | Endpoint |
|---|---|---|
| Create a booking | action | `POST /v1/bookings` |
| Get a booking | action | `GET /v1/bookings/{uid}` |
| Update a booking | action | `GET` then `PATCH /v1/bookings/{uid}` |
| Reschedule a booking | action | `POST /v1/bookings/{uid}/reschedule` |
| Cancel a booking | action | `POST /v1/bookings/{uid}/cancel` |
| List bookings | search | `GET /v1/bookings` |
| List available slots | search | `GET /v1/slots` |
| Check a slot | action | `GET /v1/slots/check` |
| Get an event type | action | `GET /v1/event-types/{idOrSlug}` |
| List event types | search | `GET /v1/event-types` |
| Get the current user | action | `GET /v1/me` |
| Make an API call | universal | any path under the API |

Instant triggers (webhooks) and recurring series are phase 2.

## Layout

```
src/app.mjs         app metadata, base, connection, module groups
src/modules.mjs     every module
src/rpcs.mjs        dynamic dropdowns
src/interfaces.mjs  output fields, shared between modules
scripts/check.mjs   Make's review prerequisites, checked locally
scripts/deploy.mjs  pushes src/ to Make
assets/logo.*       app icon (black renders white, transparent renders orange)
make-app.json       the app name Make assigned, written by the first deploy
```

## Working on it

```bash
node scripts/check.mjs                 # review checklist
node scripts/deploy.mjs --dry-run      # print the requests
node scripts/deploy.mjs                # push to Make
```

The deploy needs a Make API token with the `sdk-apps:read` and `sdk-apps:write`
scopes, read from `/root/.make-api-token` or the `MAKE_TOKEN` variable. Set
`MAKE_ZONE` if the account is not in `us2`.

Deploys go against the production API by default. To point a private build at
staging:

```bash
API_ORIGIN=https://pre.42min.us node scripts/deploy.mjs
```

## Things the 42min API requires

- Every booking write needs an `Idempotency-Key`. Each write module sends a new
  UUID unless the user maps their own key.
- `PATCH /v1/bookings/{uid}` needs `If-Match` with the booking's current ETag, so
  **Update a booking** reads the booking first and sends back what it got.
- Only `attendee_name`, `metadata` and `responses` can be updated. Moving a
  booking is Reschedule, calling it off is Cancel.
- `GET /v1/event-types/{idOrSlug}` takes an ID, or `username/event_slug` as one
  path segment with the slash written `%2F`. URL encoding is therefore off in
  that module.
- Lists are cursor paginated: `meta.next_cursor` while `meta.has_more`.

## License

MIT
