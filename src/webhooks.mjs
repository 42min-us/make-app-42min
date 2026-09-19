// Instant triggers: dedicated webhooks that 42min registers on attach and
// deletes on detach.
//
// A delivery is camelCase and nested (data.booking.startTime); the REST API is
// flat snake_case (start_at). Scenarios should not need two vocabularies, so
// the output directive maps a delivery onto the REST names. The same mapping
// the n8n node does in GenericFunctions.ts.
//
// The REST API takes underscore event names (booking_created); deliveries carry
// dot names (booking.created). Subscribing with a dot name is a 400.

const eventsParam = (options, defaults) => [
  {
    name: 'events',
    type: 'select',
    label: 'Events',
    multiple: true,
    required: true,
    default: defaults,
    options,
  },
];

// The webhook's own URL is registered with 42min, and the id and signing secret
// that come back are kept so detach and signature checks can use them. The
// secret is returned by this call only.
const attach = {
  url: '/v1/webhooks',
  method: 'POST',
  body: {
    url: '{{webhook.url}}',
    events: '{{parameters.events}}',
    description: 'Make: {{parameters.events}}',
  },
  response: {
    data: {
      externalId: '{{body.data.id}}',
      secret: '{{body.data.signing_secret}}',
    },
  },
};

const detach = {
  url: '/v1/webhooks/{{webhook.externalId}}',
  method: 'DELETE',
};

// Envelope fields every delivery carries. `delivery_id` comes from the header
// and is stable across retries, so it is what a scenario deduplicates on.
const envelope = {
  event_id: '{{body.id}}',
  event: '{{body.event}}',
  occurred_at: '{{body.createdAt}}',
  api_version: '{{body.apiVersion}}',
  delivery_id: '{{headers.`x-42min-webhook-id`}}',
};

const bookingOutput = {
  ...envelope,

  uid: '{{body.data.booking.id}}',
  event_type_id: '{{body.data.booking.eventTypeId}}',
  title: '{{body.data.booking.eventTypeName}}',
  status: '{{body.data.booking.status}}',
  start_at: '{{body.data.booking.startTime}}',
  end_at: '{{body.data.booking.endTime}}',
  timezone: '{{body.data.booking.timezone}}',

  host: {
    user_id: '{{body.data.booking.hostUser.id}}',
    email: '{{body.data.booking.hostUser.email}}',
    name: '{{trim(ifempty(body.data.booking.hostUser.firstName, "") + " " + ifempty(body.data.booking.hostUser.lastName, ""))}}',
  },
  attendees: [
    {
      email: '{{body.data.booking.inviteeEmail}}',
      name: '{{body.data.booking.inviteeName}}',
      phone: '{{body.data.booking.inviteePhone}}',
      timezone: '{{body.data.booking.timezone}}',
    },
  ],
  guests: '{{body.data.booking.guests}}',

  location: {
    url: '{{body.data.booking.meetLink}}',
    value: '{{body.data.booking.location}}',
  },
  metadata: '{{body.data.booking.urlParams}}',
  responses: '{{body.data.booking.answers}}',
  responses_by_id: '{{body.data.booking.answersById}}',
  routing_form_answers: '{{body.data.booking.routingFormAnswers}}',

  cancelled_at: '{{body.data.booking.cancelledAt}}',
  cancellation_reason: '{{body.data.booking.cancelledReason}}',
  no_show_at: '{{body.data.booking.noShowAt}}',
  no_show_reason: '{{body.data.booking.noShowReason}}',
  rescheduled_at: '{{body.data.booking.rescheduledAt}}',
  reschedule_generation: '{{body.data.booking.reschedule_generation}}',
  series_id: '{{body.data.booking.series_id}}',
  series_index: '{{body.data.booking.series_index}}',

  // Only on booking.rescheduled and booking.updated respectively.
  previous_start_at: '{{body.data.previousBooking.startTime}}',
  previous_end_at: '{{body.data.previousBooking.endTime}}',
  changed_fields: '{{body.data.changed_fields}}',
};

// Signature probe, added to the bookings webhook only when SIGNATURE_PROBE=1 is
// set on a deploy. 42min signs `timestamp.rawBody` with the webhook's signing
// secret, but a Make webhook sees only the parsed body. These fields let a
// scenario filter compare our computed value with the header, which answers
// whether verification is possible at all.
export const signatureProbe = {
  _sig_header: '{{headers.`x-42min-webhook-signature`}}',
  _sig_t: '{{replace(first(split(headers.`x-42min-webhook-signature`, ",")), "t=", "")}}',
  _sig_v1: '{{replace(last(split(headers.`x-42min-webhook-signature`, ",")), "v1=", "")}}',
  _secret_webhook: '{{webhook.secret}}',
  _secret_data: '{{data.secret}}',
  // Candidate A: the parsed body turned back into text.
  _computed_tostring:
    '{{sha256(replace(first(split(headers.`x-42min-webhook-signature`, ",")), "t=", "") + "." + toString(body), "hex", ifempty(webhook.secret, data.secret))}}',
  // Candidate B: the body interpolated into a string.
  _computed_interp:
    '{{sha256(replace(first(split(headers.`x-42min-webhook-signature`, ",")), "t=", "") + "." + body, "hex", ifempty(webhook.secret, data.secret))}}',
};

export const webhooks = [
  {
    name: 'watchBookingsHook',
    label: 'Bookings',
    type: 'web',
    parameters: eventsParam(
      [
        { label: 'Booking created', value: 'booking_created' },
        { label: 'Booking updated', value: 'booking_updated' },
        { label: 'Booking rescheduled', value: 'booking_rescheduled' },
        { label: 'Booking canceled', value: 'booking_canceled' },
        { label: 'Attendee marked as a no-show', value: 'booking_no_show' },
      ],
      ['booking_created', 'booking_rescheduled', 'booking_canceled'],
    ),
    attach,
    detach,
    api: { output: bookingOutput },
  },
  {
    name: 'watchEventTypesHook',
    label: 'Event types',
    type: 'web',
    parameters: eventsParam(
      [
        { label: 'Event type updated', value: 'event_type_updated' },
        { label: 'Event type deleted', value: 'event_type_deleted' },
      ],
      ['event_type_updated', 'event_type_deleted'],
    ),
    attach,
    detach,
    // An event type delivery carries the same shape the REST endpoint returns,
    // so the fields are passed through as they are.
    api: { output: { ...envelope, '{{...}}': '{{body.data.event_type}}' } },
  },
  {
    name: 'watchRoutingFormsHook',
    label: 'Routing forms',
    type: 'web',
    parameters: eventsParam([{ label: 'Routing form submitted', value: 'routing_form_submitted' }], [
      'routing_form_submitted',
    ]),
    attach,
    detach,
    api: {
      output: {
        ...envelope,
        id: '{{body.data.response.id}}',
        routing_form_id: '{{body.data.response.routingFormId}}',
        form_name: '{{body.data.response.formName}}',
        answers: '{{body.data.response.answers}}',
        destination_type: '{{body.data.response.destinationType}}',
        destination_value: '{{body.data.response.destinationValue}}',
        organization_id: '{{body.data.response.organizationId}}',
      },
    },
  },
];
