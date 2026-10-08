
# FamilyWall API Client

A TypeScript client for interacting with the FamilyWall API.

Forked from [CodingButter/familywall-api](https://github.com/CodingButter/familywall-api).

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
```

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
  // ... and more
} from "familywall-api";
```

---

## License

This project is licensed under the MIT License.
