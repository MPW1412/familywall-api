import assert from "node:assert/strict";
import test from "node:test";
import FamilyWallClient, { toApiDateTime } from "../src/client.js";
import { envelope, mockFetch, rejectUnexpected, requestParams } from "./support.js";

test("toApiDateTime interprets naive strings in the given zone", () => {
  assert.equal(toApiDateTime("2026-10-09T19:30:00", "Europe/Berlin"), "2026-10-09T17:30:00"); // CEST
  assert.equal(toApiDateTime("2026-12-22T08:00:00", "Europe/Berlin"), "2026-12-22T07:00:00"); // CET
  assert.equal(toApiDateTime("2026-10-09T19:30:00", "UTC"), "2026-10-09T19:30:00");
  assert.equal(toApiDateTime("2026-10-09T17:30:00Z", "Europe/Berlin"), "2026-10-09T17:30:00");
  assert.equal(toApiDateTime("2026-10-09T19:30:00+02:00", "Pacific/Auckland"), "2026-10-09T17:30:00");
  assert.throws(() => toApiDateTime("not a date", "UTC"));
});

test("createEvent sends UTC times and the client timezone", async () => {
  const mock = mockFetch((call) => {
    if (!call.url.endsWith("/evtcreate")) {
      rejectUnexpected(call);
    }
    return envelope({ eventId: "event/1" });
  });
  const client = new FamilyWallClient({ fetch: mock.fetcher, timezone: "Europe/Berlin" });

  await client.createEvent({
    text: "Dentist",
    startDate: "2026-10-09T19:30:00",
    endDate: "2026-10-09T20:00:00",
    color: "#FF5733",
    where: "",
    description: "",
  });

  const params = requestParams(mock.calls[0]!);
  assert.equal(params.get("startDate"), "2026-10-09T17:30:00");
  assert.equal(params.get("endDate"), "2026-10-09T18:00:00");
  assert.equal(params.get("timeZone"), "Europe/Berlin");
  assert.equal(params.get("allDay"), "false");
});

test("all-day events keep their local day boundaries", async () => {
  const mock = mockFetch((call) => {
    if (!call.url.endsWith("/evtupdate")) {
      rejectUnexpected(call);
    }
    return envelope({ eventId: "event/1" });
  });
  const client = new FamilyWallClient({ fetch: mock.fetcher, timezone: "Europe/Berlin" });

  await client.updateEvent("event/1", {
    text: "Holidays",
    startDate: "2026-10-19T00:00:00",
    endDate: "2026-10-31T23:59:59",
    allDay: true,
    color: "#FF5733",
    where: "",
    description: "",
  });

  const params = requestParams(mock.calls[0]!);
  assert.equal(params.get("metaId"), "event/1");
  assert.equal(params.get("startDate"), "2026-10-19T00:00:00");
  assert.equal(params.get("endDate"), "2026-10-31T23:59:59");
  assert.equal(params.get("allDay"), "true");
});
