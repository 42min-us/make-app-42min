42min is online meeting scheduling: booking pages, availability, routing forms, round robin and recurring meetings. With this app, a scenario can check availability, book, reschedule and cancel meetings, manage recurring series, and start the moment something happens in 42min.

## Connect 42min

1. In 42min, open [API > API keys](https://42min.us/360/api?tab=apiKeys) and create a key.
2. Grant the scopes for the modules you plan to use:
   - `user:read` to connect at all
   - `event_types:read` and `slots:read` for event types and availability
   - `bookings:read`, `bookings:create`, `bookings:update`, `bookings:reschedule`, `bookings:cancel` for bookings
   - `series:read`, `series:write` for recurring series
   - `webhooks:read`, `webhooks:write` for the Watch triggers
3. In Make, add a 42min module, click **Create a connection** and paste the key.

Admins can act for everyone in their organization, managers for the members of their groups, and users for themselves.

## Triggers

- **Watch bookings**: a booking is created, updated, rescheduled, canceled or marked as a no-show. You choose which of these to watch.
- **Watch event types**: an event type is updated or deleted.
- **Watch routing form submissions**: someone submits a routing form, with their answers and where the form sent them.

Adding a Watch module registers its webhook with 42min, and removing it deletes the webhook again. Each bundle carries a **Delivery ID** that stays the same when 42min retries a delivery, so filter on it if a step must never run twice.

42min signs every delivery, but Make does not give webhooks the raw request body the signature covers, so this app cannot check it. The webhook address Make generates is private to your scenario; do not share it.

## Actions and searches

- **Bookings**: create, get, update, reschedule, cancel and list bookings.
- **Availability**: list the bookable times of an event type, or check one specific time and get the next opening when it is taken.
- **Recurring series**: create a series, get or list them, change the pattern, pause, resume, end, and move a series to another host.
- **Event types**: get one, including its invitee questions, or list them.
- **Get the current user**: the user and organization the key belongs to.
- **Make an API call**: any other endpoint of the [42min API](https://42min.us/help/api).

A few things work differently from what you might expect:

- **Update a booking** changes only the attendee name, the metadata and the answers to invitee questions. Use **Reschedule a booking** to move a meeting and **Cancel a booking** to call it off.
- Creating, updating, rescheduling and canceling send a new idempotency key on every run. To make a retry safe, map a stable value (such as an ID from an earlier module) into **Idempotency key**: 42min then returns the first result instead of acting twice.
- A recurring series needs recurring meetings turned on for its event type. A series whose event type uses Google Meet or Microsoft Teams can only move to a host who has a Google or Microsoft calendar connected.

## Help

- API reference: [42min.us/help/api](https://42min.us/help/api)
- Support: [plus@42min.us](mailto:plus@42min.us)
