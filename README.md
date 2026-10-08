
# FamilyWall API Client

A TypeScript client for interacting with the FamilyWall API.

Forked from [Tomsoz/familywall-api](https://github.com/Tomsoz/familywall-api) and [CodingButter/familywall-api](https://github.com/CodingButter/familywall-api).

This client now supports messaging (threads, message history, text sending, and attachment downloads), family lists including item add and completion, and date-range calendar queries, in addition to the original calendar and family-profile features.

Not yet supported: editing or deleting list items, message pagination beyond a single bounded page, planned meals, and recipes. These are not omissions of effort — no endpoint for them appears in the available reference material, and implementing against a guessed endpoint risks destructive behavior on real family data. See [`docs/plans/remaining-api-support.md`](./docs/plans/remaining-api-support.md) for the evidence behind each.

## Installation

```bash
npm install familywall-api
```

## Usage

```typescript
import { FamilyWallClient } from "familywall-api";

const client = new FamilyWallClient({ timezone: "Europe/London" });
await client.login("email@example.com", "yourpassword");

const family = await client.getFamily();
const members = family.getMembers();
console.log(members);
```

## API

### `FamilyWallClient`

The main client class for authenticating and interacting with the FamilyWall API.

#### Constructor

```typescript
import { FamilyWallClient } from "familywall-api";

const client = new FamilyWallClient({ timezone: "Europe/London" });
```

- `options` (optional): an object that allows you to specify a `timezone`. Defaults to the system timezone.

#### Methods

- **login(email, password)** - Log in to the FamilyWall API. Automatically handles session and cookies.
- **getWebSocketUrl()** - Retrieve the WebSocket URL for live updates.
- **getAllFamily()** - Fetch all family-related data, including members, profiles, and settings.
- **getFamily()** - Returns a `Family` instance populated with family data.
- **getThreads()** - Fetch current account thread summaries. This is distinct from the cached `Family.getMessages()` summaries and is not exposed on `Family` because FamilyWall's family-scoping contract is unverified.
- **getThreadMessages(threadId, options?)** - Fetch one bounded message-history page (default limit: 20), including attachment metadata. Ordering, continuation, and read-state effects are not yet established.

---

### `Family`

Returned by `client.getFamily()`. Provides methods to access and manage family data.

#### Methods

- **getMembers()** - Get all family members.
- **getMember(firstName)** - Get a specific member by first name.
- **getMemberProfile(accountId)** - Get a member's detailed profile.
- **getFamilySettings()** - Get family settings.
- **getFamilyMedia()** - Get family cover media.
- **getMessages()** - Get messaging threads.
- **getPremiumAccountDetails()** - Get premium account details.
- **getCalendarEvents()** - List all events on the family calendar.
- **createCalendarEvent(event)** - Create an event on the family calendar.
- **deleteCalendarEvent(eventId)** - Delete an event from the family calendar.
- **updateCalendarEvent(eventId, event)** - Update an event on the family calendar.
- **getLists(options?)** - Retrieve family list summaries. Pass `{ type: "shopping" }`, `{ type: "todo" }`, or `{ type: "other" }` to filter locally.
- **getList(listId)** - Retrieve one list and its items.
- **createList(input)** - Create a shopping, todo, or other list and return its server-assigned identifier.
- **addListItem(listId, input)** - Add an item to a list with input `{ text, quantity? }`, where quantity is optional and may be a string or number.
- **setListItemCompleted(itemId, completed)** - Set an item's completion state explicitly rather than toggling it; takes an item identifier only, no list identifier.

#### Calendar Example

```typescript
import { FamilyWallClient } from "familywall-api";

const client = new FamilyWallClient();
await client.login("email@example.com", "yourpassword");

const family = await client.getFamily();

// List events
const events = await family.getCalendarEvents();
console.log(events);

// Create an event. Times without an offset are local to the client's `timezone`
// and converted to UTC for the API; ISO strings with `Z`/`+02:00` are used as-is.
const newEvent = await family.createCalendarEvent({
  text: "Dentist Appointment",
  startDate: "2026-03-01T10:00:00",
  endDate: "2026-03-01T11:00:00",
  color: "#FF5733",
  where: "123 Main St",
  description: "Annual checkup",
});

// Create an all-day event (pass the local day boundaries, they are not converted)
await family.createCalendarEvent({
  text: "School holidays",
  startDate: "2026-10-19T00:00:00",
  endDate: "2026-10-31T23:59:59",
  allDay: true,
  color: "#FF5733",
  where: "",
  description: "",
});

// Update an event
await family.updateCalendarEvent(newEvent.eventId, {
  ...newEvent,
  text: "Dentist Appointment (rescheduled)",
});

// Delete an event
await family.deleteCalendarEvent(newEvent.eventId);

// Retrieve events within a date range
const marchEvents = await family.getCalendarEvents({
  startDate: "2026-03-01",
  endDate: "2026-03-31",
});

// Or from a start date across a number of days
const nextWeek = await family.getCalendarEvents({
  startDate: "2026-03-01",
  days: 7,
});
```

Calling `getCalendarEvents()` with no arguments keeps the original unfiltered sync request and its existing return value. Supplying a range routes to a different server operation instead, so the two are not interchangeable. The underlying client method is `client.getCalendarEventsInRange(calendarId, options)`, which is available directly when you need to target a calendar other than the family's own.

Date-only values such as `"2026-03-01"` are resolved against the client's configured `timezone`, covering the whole local day from `00:00:00.000` to `23:59:59.999`. Values carrying an explicit offset, and `Date` instances, are used as the exact instants they already name. `days` counts forward from `startDate`, or from now when that is omitted, and cannot be combined with `endDate`. Reversed ranges are rejected before any request is made. Whether the server filters occurrences or whole series, and how it treats events overlapping a boundary, is not established; this is the server's own filtering and is not supplemented locally.

#### Lists Example

```typescript
const lists = await family.getLists();
const shoppingLists = await family.getLists({ type: "shopping" });

const newList = await family.createList({
  name: "Weekly groceries",
  type: "shopping",
});

const list = await family.getList(newList.id);
console.log(list.items);

// Add an item, optionally with a quantity
const item = await family.addListItem(newList.id, {
  text: "Oat milk",
  quantity: "2",
});

// Completion is explicit, never a toggle, so repeating a call is safe
await family.setListItemCompleted(item.id, true);
await family.setListItemCompleted(item.id, false);
```

List collection responses contain summaries. `getList` returns the list's items when the server provides them. The supported creation types are `shopping`, `todo`, and `other`; unknown types returned by FamilyWall are preserved as returned. List names must contain at least one non-whitespace character, and list methods throw `FamilyWallApiError` for HTTP failures, API errors, invalid JSON, or malformed responses.

`setListItemCompleted` takes the desired state rather than flipping the current one, so a retried or duplicated call cannot leave an item in the opposite state. It takes no list identifier because the underlying endpoint accepts only an item identifier. It resolves when the server accepts the change; the acknowledgement body is not yet a documented contract, so nothing is derived from it.

Editing and deleting items are not implemented. No endpoint for either operation appears in the available reference material, and guessing one risks destructive behavior against real family data.

#### Messaging example

```typescript
// `getMessages()` remains the legacy synchronous accessor for cached summaries.
const threads = await client.getThreads();
const page = await client.getThreadMessages(threads[0]!.threadId, { limit: 20 });

for (const message of page.messages) {
  console.log(message.text, message.attachments);
}

// Send a text message
await client.sendMessage(threads[0]!.threadId, { text: "On my way" });

// Stream an attachment, capped at 10 MB
const [attachment] = page.messages[0]!.attachments;
if (attachment) {
  const download = await client.downloadAttachment(attachment, {
    maxBytes: 10 * 1024 * 1024,
  });
  console.log(download.mimeType, download.filename);
  // `download.body` is a ReadableStream the caller consumes or pipes.
}
```

Message reads and writes use the public reference protocol but have not been verified against a live account. The library still does not follow pagination continuations.

`sendMessage` issues exactly one request and is never retried automatically. If the response is lost in transit the message may still have been delivered, so retrying could send it twice; callers that need certainty should re-read the thread before deciding.

`downloadAttachment` streams bytes rather than buffering them, so large video does not have to fit in memory. Session credentials are attached only to FamilyWall's own hosts: redirects are followed manually, and a redirect that leaves those hosts drops the cookie and CSRF token instead of forwarding them to a CDN. `maxBytes` is enforced while reading, because `Content-Length` may be absent or wrong. Server-supplied filenames are reduced to a bare basename, but callers choosing a filesystem destination should still treat them as untrusted.

---

## Types

All types are exported from the package:

```typescript
import type {
  Member,
  FamilySettings,
  CalendarEvent,
  CreateEventRequest,
  PremiumDetails,
  ListSummary,
  ListDetails,
  CreateListRequest,
  AddListItemRequest,
  GetCalendarRangeOptions,
  SendMessageRequest,
  MessageAttachment,
  DownloadAttachmentOptions,
  AttachmentDownload,
  // ... and more
} from "familywall-api";
```

---

## License

This project is licensed under the MIT License.
