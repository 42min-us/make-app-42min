// App metadata, base, connection and module groups.
//
// __API_ORIGIN__ (e.g. https://api.42min.us, no /v1) is substituted at deploy time by
// scripts/deploy.mjs. The review build must use production; a private test build
// may point at staging. Paths carry the version (/v1/...), as the universal module
// requires users to type it.

export const app = {
  label: '42min',
  description:
    'Online meeting scheduling. Book meetings, check availability and manage bookings in 42min.',
  theme: '#f25c2c',
  language: 'en',
  countries: [],
};

export const base = {
  baseUrl: '__API_ORIGIN__',
  headers: {
    authorization: 'Bearer {{connection.apiKey}}',
    accept: 'application/json',
  },
  response: {
    // Errors are {error: {code, message, request_id}}, not wrapped in `data`.
    // A non-JSON body (a proxy error page) still yields a readable message.
    error: {
      message:
        "[{{statusCode}}] {{ifempty(body.error.message, 'Unexpected response from 42min.')}}{{if(body.error.code, ' (' + body.error.code + ')', '')}}",
    },
  },
  log: { sanitize: ['request.headers.authorization'] },
};

export const connection = {
  label: '42min',
  type: 'basic',
  parameters: [
    {
      name: 'apiKey',
      type: 'password',
      label: 'API key',
      required: true,
      editable: true,
      help:
        'In 42min, open [API > API keys](https://42min.us/360/api?tab=apiKeys) and create a key. ' +
        'Grant the scopes for the modules you use: `user:read`, `event_types:read`, `slots:read`, ' +
        '`bookings:read`, `bookings:create`, `bookings:update`, `bookings:reschedule`, `bookings:cancel`, ' +
        '`series:read`, `series:write`, `webhooks:read` and `webhooks:write`.',
    },
  ],
  // A connection does not inherit the base, so the URL and header are spelled out.
  api: {
    url: '__API_ORIGIN__/v1/me',
    method: 'GET',
    headers: {
      authorization: 'Bearer {{parameters.apiKey}}',
      accept: 'application/json',
    },
    response: {
      error: {
        message:
          "[{{statusCode}}] {{ifempty(body.error.message, 'Unexpected response from 42min.')}}{{if(body.error.code, ' (' + body.error.code + ')', '')}}",
      },
      metadata: { type: 'email', value: '{{body.data.user.email}}' },
    },
    log: { sanitize: ['request.headers.authorization'] },
  },
};

export const groups = [
  {
    label: 'Bookings',
    modules: ['createBooking', 'getBooking', 'updateBooking', 'rescheduleBooking', 'cancelBooking', 'listBookings'],
  },
  { label: 'Availability', modules: ['listSlots', 'checkSlot'] },
  { label: 'Event types', modules: ['getEventType', 'listEventTypes'] },
  { label: 'Account', modules: ['getCurrentUser'] },
  { label: 'Other', modules: ['makeApiCall'] },
];
