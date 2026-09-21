// Remote procedure calls: the live dropdowns shown while a user configures a
// module. Paginated and limited, both required for review.

export const rpcs = [
  {
    name: 'listEventTypesRpc',
    label: 'List event types',
    api: {
      url: '/v1/event-types',
      method: 'GET',
      qs: { limit: 100 },
      response: {
        iterate: '{{body.data}}',
        output: {
          label: "{{item.title}} ({{item.duration_minutes}} min){{if(item.hosts, ' - ' + join(map(item.hosts, 'username'), ', '), '')}}",
          value: '{{item.id}}',
        },
        // The API caps a page at 100, so 300 keeps the picker to three requests.
        limit: 300,
      },
      pagination: {
        qs: { cursor: '{{body.meta.next_cursor}}' },
        condition: '{{body.meta.has_more}}',
      },
    },
  },
];
