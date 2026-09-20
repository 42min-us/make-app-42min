// Output interfaces, shared by every module that returns the same record.
// Field names match the REST API exactly, so a bundle from a search and one
// from an action can be mapped the same way.

const text = (name, label) => ({ name, type: 'text', label });
const date = (name, label) => ({ name, type: 'date', label });
const uint = (name, label) => ({ name, type: 'uinteger', label });
const bool = (name, label) => ({ name, type: 'boolean', label });

export const booking = [
  text('uid', 'Booking UID'),
  uint('version', 'Version'),
  text('event_type_id', 'Event type ID'),
  text('event_type_slug', 'Event type slug'),
  text('title', 'Title'),
  text('status', 'Status'),
  date('start_at', 'Start'),
  date('end_at', 'End'),
  text('timezone', 'Timezone'),
  {
    name: 'host',
    type: 'collection',
    label: 'Host',
    spec: [text('user_id', 'User ID'), text('username', 'Username'), { name: 'email', type: 'email', label: 'Email' }],
  },
  {
    name: 'attendees',
    type: 'array',
    label: 'Attendees',
    spec: [{ name: 'email', type: 'email', label: 'Email' }, text('name', 'Name'), text('timezone', 'Timezone')],
  },
  {
    name: 'guests',
    type: 'array',
    label: 'Guests',
    spec: [{ name: 'email', type: 'email', label: 'Email' }, text('name', 'Name')],
  },
  {
    name: 'location',
    type: 'collection',
    label: 'Location',
    spec: [text('type', 'Type'), { name: 'url', type: 'url', label: 'URL' }, text('value', 'Value')],
  },
  { name: 'metadata', type: 'any', label: 'Metadata' },
  { name: 'responses', type: 'any', label: 'Responses' },
  text('calendar_sync_status', 'Calendar sync status'),
  text('calendar_event_id', 'Calendar event ID'),
  text('rescheduled_from_uid', 'Rescheduled from booking UID'),
  date('cancelled_at', 'Canceled at'),
  text('cancellation_reason', 'Cancellation reason'),
  date('no_show_at', 'Marked as no-show at'),
  text('no_show_reason', 'No-show reason'),
  text('series_id', 'Series ID'),
  uint('series_index', 'Position in series'),
  date('created_at', 'Created at'),
  date('updated_at', 'Updated at'),
];

export const eventType = [
  text('id', 'Event type ID'),
  text('slug', 'Slug'),
  text('title', 'Title'),
  text('description', 'Description'),
  uint('duration_minutes', 'Duration (minutes)'),
  bool('active', 'Active'),
  text('scheduling_type', 'Scheduling type'),
  {
    name: 'hosts',
    type: 'array',
    label: 'Hosts',
    spec: [text('user_id', 'User ID'), text('username', 'Username'), text('name', 'Name')],
  },
  { name: 'url', type: 'url', label: 'Booking page URL' },
  text('color', 'Color'),
  uint('buffer_before_minutes', 'Buffer before (minutes)'),
  uint('buffer_after_minutes', 'Buffer after (minutes)'),
  uint('minimum_notice_hours', 'Minimum notice (hours)'),
  uint('future_limit_days', 'Date range (days)'),
  text('timezone', 'Timezone'),
  date('created_at', 'Created at'),
  date('updated_at', 'Updated at'),
];

// GET /event-types/{id} returns the list fields plus these.
export const eventTypeDetail = [
  ...eventType,
  {
    name: 'locations',
    type: 'array',
    label: 'Locations',
    spec: [text('type', 'Type'), text('label', 'Label'), text('value', 'Value')],
  },
  {
    name: 'questions',
    type: 'array',
    label: 'Invitee questions',
    spec: [text('id', 'ID'), text('key', 'Key'), text('label', 'Label'), text('type', 'Type'), bool('required', 'Required')],
  },
  uint('max_bookings_per_day', 'Max bookings per day'),
  uint('max_bookings_per_week', 'Max bookings per week'),
  uint('max_bookings_per_month', 'Max bookings per month'),
  bool('requires_confirmation', 'Requires confirmation'),
  bool('allow_reschedule', 'Allows rescheduling'),
  bool('allow_cancel', 'Allows canceling'),
];

export const slot = [
  date('start', 'Start'),
  date('end', 'End'),
  bool('available', 'Available'),
  text('host_user_id', 'Host user ID'),
  text('event_type_id', 'Event type ID'),
  text('timezone', 'Timezone'),
];

export const slotCheck = [
  bool('available', 'Available'),
  uint('duration_minutes', 'Duration (minutes)'),
  text('reason', 'Reason unavailable'),
  date('next_available', 'Next available start'),
];

export const me = [
  {
    name: 'user',
    type: 'collection',
    label: 'User',
    spec: [
      text('id', 'User ID'),
      text('username', 'Username'),
      { name: 'email', type: 'email', label: 'Email' },
      text('name', 'Name'),
      text('first_name', 'First name'),
      text('last_name', 'Last name'),
      text('timezone', 'Timezone'),
      text('locale', 'Language'),
      { name: 'avatar_url', type: 'url', label: 'Avatar URL' },
    ],
  },
  {
    name: 'organization',
    type: 'collection',
    label: 'Organization',
    spec: [text('id', 'Organization ID'), text('name', 'Name'), text('plan', 'Plan')],
  },
];

// Instant trigger output: the delivery envelope plus the record it carries.
const envelopeFields = [
  text('event_id', 'Event ID'),
  text('event', 'Event'),
  date('occurred_at', 'Occurred at'),
  text('api_version', 'Payload version'),
  text('delivery_id', 'Delivery ID'),
];

export const bookingEvent = [
  ...envelopeFields,
  ...booking.filter((f) => !['version', 'event_type_slug', 'calendar_sync_status', 'calendar_event_id', 'rescheduled_from_uid', 'created_at', 'updated_at'].includes(f.name)),
  { name: 'responses_by_id', type: 'any', label: 'Answers by question ID' },
  { name: 'routing_form_answers', type: 'any', label: 'Routing form answers' },
  date('rescheduled_at', 'Rescheduled at'),
  uint('reschedule_generation', 'Reschedule number'),
  date('previous_start_at', 'Previous start'),
  date('previous_end_at', 'Previous end'),
  { name: 'changed_fields', type: 'array', label: 'Changed fields', spec: { name: 'field', type: 'text', label: 'Field' } },
];

export const eventTypeEvent = [...envelopeFields, ...eventTypeDetail];

export const routingFormEvent = [
  ...envelopeFields,
  text('id', 'Response ID'),
  text('routing_form_id', 'Routing form ID'),
  text('form_name', 'Form name'),
  { name: 'answers', type: 'any', label: 'Answers' },
  text('destination_type', 'Destination type'),
  text('destination_value', 'Destination value'),
  text('organization_id', 'Organization ID'),
];

export const series = [
  text('uid', 'Series UID'),
  uint('version', 'Version'),
  {
    name: 'event_type',
    type: 'collection',
    label: 'Event type',
    spec: [text('id', 'ID'), text('slug', 'Slug'), text('name', 'Name')],
  },
  {
    name: 'host',
    type: 'collection',
    label: 'Host',
    spec: [text('user_id', 'User ID'), text('username', 'Username'), { name: 'email', type: 'email', label: 'Email' }],
  },
  {
    name: 'attendee',
    type: 'collection',
    label: 'Attendee',
    spec: [text('name', 'Name'), { name: 'email', type: 'email', label: 'Email' }, text('phone', 'Phone')],
  },
  text('frequency', 'Frequency'),
  uint('interval_weeks', 'Weeks between repeats'),
  { name: 'weekdays', type: 'array', label: 'Weekdays', spec: { name: 'day', type: 'text', label: 'Day' } },
  text('time', 'Time of day'),
  text('timezone', 'Timezone'),
  date('starts_on', 'Starts on'),
  uint('count', 'Meetings requested'),
  text('status', 'Status'),
  { name: 'location_url', type: 'url', label: 'Fixed meeting link' },
  bool('notify_invitee', 'Emails the attendee'),
  text('source', 'Created through'),
  date('created_at', 'Created at'),
  date('updated_at', 'Updated at'),
  date('ended_at', 'Ended at'),
];

const occurrences = {
  name: 'occurrences',
  type: 'array',
  label: 'Meetings booked',
  spec: [text('uid', 'Booking UID'), date('start_at', 'Start'), date('end_at', 'End'), text('status', 'Status')],
};

const skipped = {
  name: 'skipped',
  type: 'array',
  label: 'Dates skipped',
  spec: [date('start_at', 'Date'), text('reason', 'Reason')],
};

// POST /series answers with the series plus what it just booked.
export const seriesCreated = [...series, occurrences, skipped];

// GET /series and /series/{uid} add where the series has got to.
export const seriesWithProgress = [
  ...series,
  {
    name: 'next_occurrence',
    type: 'collection',
    label: 'Next meeting',
    spec: [text('uid', 'Booking UID'), date('start_at', 'Start')],
  },
  uint('remaining', 'Meetings still ahead'),
];

// Every series action answers with the same envelope, and fills in only the
// fields that apply to it.
export const seriesAction = [
  uint('held', 'Meetings put on hold'),
  uint('created', 'Meetings rebooked'),
  uint('owed', 'Meetings still owed'),
  uint('canceled', 'Meetings canceled'),
  uint('moved', 'Meetings moved to the new host'),
  uint('unchanged', 'Meetings already with that host'),
  text('stopped_by', 'Stopped because'),
  skipped,
];

// PATCH /series/{uid} answers with the series plus, when the pattern changed,
// what had to be rebooked.
export const seriesUpdated = [
  ...series,
  { name: 'resumed', type: 'collection', label: 'Rebooking result', spec: seriesAction },
];
