// Every module of the app. Paths carry /v1 because the base is the bare origin
// (see app.mjs). Responses are wrapped as {data, meta}; errors are handled in
// the base.
import * as I from './interfaces.mjs';

const ACTION = 4;
const SEARCH = 9;
const UNIVERSAL = 12;

// ---------------------------------------------------------------- helpers

/** A date parameter sent as UTC ISO 8601, or omitted when empty. */
const iso = (p) =>
  `{{if(parameters.${p}, formatDate(parameters.${p}, 'YYYY-MM-DDTHH:mm:ss[Z]', 'UTC'), undefined)}}`;

/** A key/value array parameter sent as an object, or omitted when empty. */
const keyValues = (p) => `{{if(parameters.${p}, toCollection(parameters.${p}, 'key', 'value'), undefined)}}`;

const keyValueParam = (name, label, help) => ({
  name,
  type: 'array',
  label,
  help,
  spec: [
    { name: 'key', type: 'text', label: 'Key', required: true },
    { name: 'value', type: 'text', label: 'Value' },
  ],
});

// Required on every booking write: without it the API answers 400 and does
// nothing. A fresh UUID per run unless the user maps their own value, which is
// what makes a deliberate retry replay instead of booking twice.
const idempotencyParam = {
  name: 'idempotency_key',
  type: 'text',
  label: 'Idempotency key',
  advanced: true,
  help:
    'Sending the same key again within 24 hours returns the first result instead of repeating the action. ' +
    'Leave empty to use a new key on every run. Map a stable value, such as an ID from an earlier module, to make retries safe.',
};
const idempotencyHeader = { 'idempotency-key': '{{ifempty(parameters.idempotency_key, uuid)}}' };

const uidParam = {
  name: 'uid',
  type: 'text',
  label: 'Booking UID',
  required: true,
  help: 'The `uid` of a booking, as returned by **List bookings**, **Create a booking** or a trigger.',
};

// The event type is identified by ID, or by the host's username plus the event
// slug. A slug alone is rejected: it is unique per user, not per account.
const eventTypeParam = (required = true) => ({
  name: 'identify_by',
  type: 'select',
  label: 'Identify the event type by',
  required,
  default: 'id',
  options: [
    {
      label: 'Event type',
      value: 'id',
      nested: [
        {
          name: 'event_type_id',
          type: 'select',
          label: 'Event type',
          required,
          options: 'rpc://listEventTypesRpc',
        },
      ],
    },
    {
      label: 'Username and event slug',
      value: 'slug',
      nested: [
        {
          name: 'username',
          type: 'text',
          label: 'Username',
          required,
          help: "The host's 42min username: the part after `42min.us/` in their booking link.",
        },
        {
          name: 'event_slug',
          type: 'text',
          label: 'Event slug',
          required,
          help: "The last part of the event's booking link, for example `intro-call`.",
        },
      ],
    },
  ],
});
// Only the chosen option's fields exist, so the others resolve to undefined and
// are left out of the request.
const eventTypeFields = {
  event_type_id: '{{parameters.event_type_id}}',
  username: '{{parameters.username}}',
  event_slug: '{{parameters.event_slug}}',
};

const limitParam = (what) => ({
  name: 'limit',
  type: 'uinteger',
  label: 'Limit',
  default: 10,
  help: `The maximum number of ${what} to return during one execution cycle.`,
});

// Cursor pagination. Make merges these keys into the original query string, so
// the user's filters carry over to every page.
const cursorPagination = {
  qs: { cursor: '{{body.meta.next_cursor}}' },
  condition: '{{body.meta.has_more}}',
};

const timezoneParam = (name, label, help) => ({ name, type: 'timezone', label, help });

// ---------------------------------------------------------------- bookings

const createBooking = {
  name: 'createBooking',
  typeId: ACTION,
  crud: 'create',
  label: 'Create a booking',
  description:
    'Creates a new booking for an event type at a given start time, and sends the usual confirmation emails. Check the time with the Check a slot module first.',
  api: {
    url: '/v1/bookings',
    method: 'POST',
    headers: idempotencyHeader,
    body: {
      ...eventTypeFields,
      start: iso('start'),
      timezone: '{{parameters.timezone}}',
      attendee: {
        email: '{{parameters.attendee_email}}',
        name: '{{parameters.attendee_name}}',
        first_name: '{{parameters.attendee_first_name}}',
        last_name: '{{parameters.attendee_last_name}}',
        phone: '{{parameters.attendee_phone}}',
        timezone: '{{parameters.attendee_timezone}}',
        sms_opt_in: '{{parameters.sms_opt_in}}',
      },
      guests: '{{parameters.guests}}',
      responses: keyValues('responses'),
      metadata: keyValues('metadata'),
      utm_source: '{{parameters.utm_source}}',
      utm_medium: '{{parameters.utm_medium}}',
      utm_campaign: '{{parameters.utm_campaign}}',
    },
    response: { output: '{{body.data}}' },
  },
  expect: [
    eventTypeParam(),
    { name: 'start', type: 'date', label: 'Start', required: true, help: 'The start time of the meeting.' },
    {
      name: 'attendee_email',
      type: 'email',
      label: 'Attendee email',
      required: true,
      help: 'Must be a deliverable ASCII address.',
    },
    { name: 'attendee_name', type: 'text', label: 'Attendee name' },
    { name: 'attendee_first_name', type: 'text', label: 'Attendee first name' },
    { name: 'attendee_last_name', type: 'text', label: 'Attendee last name' },
    {
      name: 'attendee_phone',
      type: 'text',
      label: 'Attendee phone',
      help: 'International format, starting with `+`.',
    },
    {
      name: 'sms_opt_in',
      type: 'boolean',
      label: 'Attendee agrees to text messages',
      help: 'Requires **Attendee phone**. Workflow text messages go only to attendees who agreed.',
    },
    timezoneParam('attendee_timezone', 'Attendee timezone', 'The timezone the attendee sees times in.'),
    timezoneParam('timezone', 'Booking timezone'),
    {
      name: 'guests',
      type: 'array',
      label: 'Guests',
      help: 'Additional people to copy on the invitation.',
      spec: { name: 'email', type: 'email', label: 'Email' },
    },
    keyValueParam(
      'responses',
      'Answers to invitee questions',
      "Answers keyed by the question's key. **Get an event type** lists the questions and their keys.",
    ),
    keyValueParam('metadata', 'Metadata', 'Your own key-value data, returned unchanged when the booking is read.'),
    { name: 'utm_source', type: 'text', label: 'UTM source', advanced: true },
    { name: 'utm_medium', type: 'text', label: 'UTM medium', advanced: true },
    { name: 'utm_campaign', type: 'text', label: 'UTM campaign', advanced: true },
    idempotencyParam,
  ],
  interface: I.booking,
};

const getBooking = {
  name: 'getBooking',
  typeId: ACTION,
  crud: 'read',
  label: 'Get a booking',
  description: 'Returns information about a specific booking by its UID.',
  api: {
    url: '/v1/bookings/{{parameters.uid}}',
    method: 'GET',
    response: { output: '{{body.data}}' },
  },
  expect: [uidParam],
  interface: I.booking,
};

// PATCH needs the booking's current ETag in If-Match (428 without it, 409 if
// someone changed the booking in between), so read it first.
const updateBooking = {
  name: 'updateBooking',
  typeId: ACTION,
  label: 'Update a booking',
  description:
    "Updates a booking's attendee name, metadata or invitee answers. To move a booking to another time use the Reschedule a booking module; to call it off use Cancel a booking.",
  api: [
    {
      url: '/v1/bookings/{{parameters.uid}}',
      method: 'GET',
      response: { temp: { etag: '{{headers.etag}}' } },
    },
    {
      url: '/v1/bookings/{{parameters.uid}}',
      method: 'PATCH',
      headers: { ...idempotencyHeader, 'if-match': '{{temp.etag}}' },
      body: {
        attendee_name: '{{parameters.attendee_name}}',
        metadata: keyValues('metadata'),
        responses: keyValues('responses'),
      },
      response: { output: '{{body.data}}' },
    },
  ],
  expect: [
    uidParam,
    { name: 'attendee_name', type: 'text', label: 'Attendee name', help: 'Up to 200 characters.' },
    keyValueParam(
      'metadata',
      'Metadata',
      'Merged into the existing metadata: keys you send are added or replaced, other keys stay.',
    ),
    keyValueParam(
      'responses',
      'Answers to invitee questions',
      'Replaces all stored answers. Leave empty to keep them.',
    ),
    idempotencyParam,
  ],
  interface: I.booking,
};

const rescheduleBooking = {
  name: 'rescheduleBooking',
  typeId: ACTION,
  label: 'Reschedule a booking',
  description:
    'Moves a booking to a new start time and notifies the attendee. Returns the rescheduled booking, which has a new UID.',
  api: {
    url: '/v1/bookings/{{parameters.uid}}/reschedule',
    method: 'POST',
    headers: idempotencyHeader,
    body: {
      start: iso('start'),
      timezone: '{{parameters.timezone}}',
      reason: '{{parameters.reason}}',
    },
    response: { output: '{{body.data}}' },
  },
  expect: [
    uidParam,
    { name: 'start', type: 'date', label: 'New start', required: true },
    timezoneParam('timezone', 'Timezone'),
    { name: 'reason', type: 'text', label: 'Reason', help: 'Shown to the attendee.' },
    idempotencyParam,
  ],
  interface: I.booking,
};

const cancelBooking = {
  name: 'cancelBooking',
  typeId: ACTION,
  label: 'Cancel a booking',
  description: 'Cancels a booking and sends the attendee a cancellation email.',
  api: {
    url: '/v1/bookings/{{parameters.uid}}/cancel',
    method: 'POST',
    headers: idempotencyHeader,
    body: { reason: '{{parameters.reason}}' },
    response: { output: '{{body.data}}' },
  },
  expect: [
    uidParam,
    { name: 'reason', type: 'text', label: 'Reason', help: 'Shown to the attendee in the cancellation email.' },
    idempotencyParam,
  ],
  interface: I.booking,
};

const listBookings = {
  name: 'listBookings',
  typeId: SEARCH,
  label: 'List bookings',
  description:
    'Returns a list of bookings, optionally filtered by status, event type, host, attendee or date.',
  api: {
    url: '/v1/bookings',
    method: 'GET',
    qs: {
      limit: 100,
      status: "{{if(parameters.status, join(parameters.status, ','), undefined)}}",
      event_type_id: '{{parameters.event_type_id}}',
      series_id: '{{parameters.series_id}}',
      host_user_id: '{{parameters.host_user_id}}',
      attendee_email: '{{parameters.attendee_email}}',
      start_date: iso('start_date'),
      end_date: iso('end_date'),
      updated_since: iso('updated_since'),
      include_cancelled: '{{parameters.include_cancelled}}',
      sort: '{{parameters.sort}}',
    },
    response: {
      iterate: '{{body.data}}',
      output: '{{item}}',
      limit: '{{parameters.limit}}',
    },
    pagination: cursorPagination,
  },
  expect: [
    limitParam('bookings'),
    {
      name: 'status',
      type: 'select',
      label: 'Status',
      multiple: true,
      options: [
        { label: 'Confirmed', value: 'confirmed' },
        { label: 'Canceled', value: 'canceled' },
        { label: 'Rescheduled', value: 'rescheduled' },
      ],
    },
    {
      name: 'event_type_id',
      type: 'select',
      label: 'Event type',
      options: 'rpc://listEventTypesRpc',
    },
    { name: 'start_date', type: 'date', label: 'Starting from', help: 'Only bookings that start at or after this time.' },
    { name: 'end_date', type: 'date', label: 'Starting before', help: 'Only bookings that start before this time.' },
    {
      name: 'updated_since',
      type: 'date',
      label: 'Updated since',
      help: 'Only bookings changed at or after this time. Useful for syncing changes.',
    },
    { name: 'attendee_email', type: 'email', label: 'Attendee email' },
    { name: 'host_user_id', type: 'text', label: 'Host user ID', advanced: true },
    {
      name: 'series_id',
      type: 'text',
      label: 'Series ID',
      advanced: true,
      help: 'Only the meetings of this recurring series.',
    },
    {
      name: 'include_cancelled',
      type: 'boolean',
      label: 'Include canceled bookings',
      advanced: true,
      help: 'Ignored when **Status** is set.',
    },
    {
      name: 'sort',
      type: 'select',
      label: 'Sort by',
      advanced: true,
      options: [
        { label: 'Start time, newest first', value: 'start_at_desc' },
        { label: 'Start time, oldest first', value: 'start_at_asc' },
        { label: 'Created, newest first', value: 'created_at_desc' },
        { label: 'Created, oldest first', value: 'created_at_asc' },
      ],
    },
  ],
  interface: I.booking,
};

// ---------------------------------------------------------------- availability

const slotQuery = {
  ...eventTypeFields,
  timezone: '{{parameters.timezone}}',
};

const listSlots = {
  name: 'listSlots',
  typeId: SEARCH,
  label: 'List available slots',
  description:
    'Returns a list of bookable start times for an event type within a date range. A very wide range is shortened by 42min.',
  api: {
    url: '/v1/slots',
    method: 'GET',
    qs: { ...slotQuery, start: iso('start'), end: iso('end') },
    response: {
      iterate: '{{body.data.slots}}',
      // Each slot carries the event type and timezone it was computed for, so a
      // bundle stands on its own after an iterator.
      output: {
        start: '{{item.start}}',
        end: '{{item.end}}',
        available: '{{item.available}}',
        host_user_id: '{{item.host_user_id}}',
        event_type_id: '{{body.data.event_type_id}}',
        timezone: '{{body.data.timezone}}',
      },
      limit: '{{parameters.limit}}',
    },
  },
  expect: [
    eventTypeParam(),
    { name: 'start', type: 'date', label: 'From', required: true },
    { name: 'end', type: 'date', label: 'To', required: true },
    timezoneParam('timezone', 'Timezone', 'The timezone the slots are computed for.'),
    limitParam('slots'),
  ],
  interface: I.slot,
};

const checkSlot = {
  name: 'checkSlot',
  typeId: ACTION,
  label: 'Check a slot',
  description:
    'Checks whether a specific start time can be booked. If not, returns the reason and the next available start time.',
  api: {
    url: '/v1/slots/check',
    method: 'GET',
    qs: { ...slotQuery, start: iso('start'), end: iso('end') },
    response: { output: '{{body.data}}' },
  },
  expect: [
    eventTypeParam(),
    { name: 'start', type: 'date', label: 'Start', required: true },
    {
      name: 'end',
      type: 'date',
      label: 'End',
      advanced: true,
      help: "Defaults to the start plus the event type's duration.",
    },
    timezoneParam('timezone', 'Timezone'),
  ],
  interface: I.slotCheck,
};

// ---------------------------------------------------------------- event types

// username/event_slug is ONE path segment, so the slash is sent as %2F. URL
// encoding is off for this module, or Make would turn %2F into %252F.
const getEventType = {
  name: 'getEventType',
  typeId: ACTION,
  crud: 'read',
  label: 'Get an event type',
  description:
    'Returns information about a specific event type, including its invitee questions, by its ID or by username and slug.',
  api: {
    url: "/v1/event-types/{{if(parameters.identify_by === 'slug', encodeURL(parameters.username) + '%2F' + encodeURL(parameters.event_slug), encodeURL(parameters.event_type_id))}}",
    encodeUrl: false,
    method: 'GET',
    response: { output: '{{body.data}}' },
  },
  expect: [eventTypeParam()],
  interface: I.eventTypeDetail,
};

const listEventTypes = {
  name: 'listEventTypes',
  typeId: SEARCH,
  label: 'List event types',
  description: 'Returns a list of event types, optionally only active ones or those of one host.',
  api: {
    url: '/v1/event-types',
    method: 'GET',
    qs: {
      limit: 100,
      active: '{{parameters.active}}',
      user_id: '{{parameters.user_id}}',
      slug: '{{parameters.slug}}',
    },
    response: {
      iterate: '{{body.data}}',
      output: '{{item}}',
      limit: '{{parameters.limit}}',
    },
    pagination: cursorPagination,
  },
  expect: [
    limitParam('event types'),
    {
      name: 'active',
      type: 'boolean',
      label: 'Active only',
      help: 'Yes returns only event types that accept bookings. Leave empty for all.',
    },
    { name: 'user_id', type: 'text', label: 'Host user ID', help: 'Only event types hosted by this user.' },
    { name: 'slug', type: 'text', label: 'Slug' },
  ],
  interface: I.eventType,
};

// ---------------------------------------------------------------- account

const getCurrentUser = {
  name: 'getCurrentUser',
  typeId: ACTION,
  crud: 'read',
  label: 'Get the current user',
  description: 'Returns the user and organization the API key belongs to.',
  api: {
    url: '/v1/me',
    method: 'GET',
    response: { output: '{{body.data}}' },
  },
  expect: [],
  interface: I.me,
};

// ---------------------------------------------------------------- universal

// The URL is appended to the fixed origin, never taken whole from the user, so
// the token cannot be sent to another host.
const makeApiCall = {
  name: 'makeApiCall',
  typeId: UNIVERSAL,
  label: 'Make an API call',
  description:
    "Sends a custom API call to 42min. You can use this to call endpoints that aren't covered by existing modules.",
  api: {
    url: '__API_ORIGIN__/{{parameters.url}}',
    method: '{{parameters.method}}',
    qs: { '{{...}}': "{{toCollection(parameters.qs, 'key', 'value')}}" },
    headers: { '{{...}}': "{{toCollection(parameters.headers, 'key', 'value')}}" },
    body: '{{parameters.body}}',
    type: 'text',
    response: {
      output: {
        body: '{{body}}',
        headers: '{{headers}}',
        statusCode: '{{statusCode}}',
      },
    },
  },
  expect: [
    {
      name: 'url',
      type: 'text',
      label: 'URL',
      required: true,
      help: 'Enter a path relative to `https://api.42min.us`, for example `/v1/bookings`. See the [API reference](https://42min.us/help/api).',
    },
    {
      name: 'method',
      type: 'select',
      label: 'Method',
      required: true,
      default: 'GET',
      options: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map((m) => ({ label: m, value: m })),
    },
    {
      name: 'headers',
      type: 'array',
      label: 'Headers',
      help: 'The authorization header is added for you. Booking writes also need `Idempotency-Key`, and updates need `If-Match`.',
      default: [{ key: 'Content-Type', value: 'application/json' }],
      spec: [
        { name: 'key', type: 'text', label: 'Key' },
        { name: 'value', type: 'text', label: 'Value' },
      ],
    },
    {
      name: 'qs',
      type: 'array',
      label: 'Query string',
      spec: [
        { name: 'key', type: 'text', label: 'Key' },
        { name: 'value', type: 'text', label: 'Value' },
      ],
    },
    { name: 'body', type: 'any', label: 'Body' },
  ],
  interface: [
    { name: 'body', type: 'any', label: 'Body' },
    { name: 'headers', type: 'collection', label: 'Headers' },
    { name: 'statusCode', type: 'number', label: 'Status code' },
  ],
};

export const modules = [
  createBooking,
  getBooking,
  updateBooking,
  rescheduleBooking,
  cancelBooking,
  listBookings,
  listSlots,
  checkSlot,
  getEventType,
  listEventTypes,
  getCurrentUser,
  makeApiCall,
];
