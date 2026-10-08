import Family from "./family.js";
import type {
  AllFamilyResponse,
  FamilyWallClientOptions,
  WebSocketUrlResponse,
  RawProfile,
  EventSyncResponse,
  EventDeleteResponse,
  CalendarEvent,
  CreateEventRequest,
  EventCreateResponse,
  AddListItemRequest,
  AttachmentDownload,
  CreateListRequest,
  DownloadAttachmentOptions,
  GetCalendarRangeOptions,
  GetListsOptions,
  SendMessageRequest,
  ListDetails,
  ListItem,
  ListSummary,
  ListType,
  RawList,
  RawListCollectionResult,
  RawListCreateResult,
  RawListDetailResult,
  Message,
  MessageAttachment,
  MessagePage,
  GetThreadMessagesOptions,
  Thread,
} from "./types.js";

function serialize(data: Record<string, string | number | boolean>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(data)) {
    params.set(key, String(value));
  }
  return params.toString();
}

function setCookie(jsessionid: string): string {
  return `_gid=GA1.2.2118125424.1726621203; _gat_gtag_UA_30098956_2=1; _gat_gtag_UA_37056134_1=1; JSESSIONID=${jsessionid}; _ga_5GHHS7PK50=GS1.1.1726621036.1.1.1726622248.0.0.0; _ga_QEJNR13YN6=GS1.1.1726621037.1.1.1726622248.0.0.0; _ga=GA1.1.600776544.1726621203`;
}

export class FamilyWallApiError extends Error {
  readonly endpoint: string;
  readonly status: number | undefined;
  readonly apiError: unknown;

  constructor(
    message: string,
    endpoint: string,
    options: { status?: number; apiError?: unknown; cause?: unknown } = {}
  ) {
    super(message);
    this.name = "FamilyWallApiError";
    this.endpoint = endpoint;
    this.status = options.status;
    this.apiError = options.apiError;
    if (options.cause !== undefined) {
      (this as Error & { cause?: unknown }).cause = options.cause;
    }
  }
}

export class FamilyWallValidationError extends TypeError {
  constructor(message: string) {
    super(message);
    this.name = "FamilyWallValidationError";
  }
}

const LIST_TYPE_TO_API: Record<ListType, string> = {
  shopping: "SHOPPING",
  todo: "TODO",
  other: "OTHER",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getString(
  value: Record<string, unknown>,
  keys: string[]
): string | undefined {
  for (const key of keys) {
    const candidate = value[key];
    if (typeof candidate === "string") {
      return candidate;
    }
    if (typeof candidate === "number") {
      return String(candidate);
    }
  }
  return undefined;
}

function getNumber(
  value: Record<string, unknown>,
  keys: string[]
): number | undefined {
  for (const key of keys) {
    const candidate = value[key];
    if (typeof candidate === "number" && Number.isFinite(candidate)) {
      return candidate;
    }
    if (typeof candidate === "string" && candidate.trim() !== "") {
      const number = Number(candidate);
      if (Number.isFinite(number)) {
        return number;
      }
    }
  }
  return undefined;
}

function getBoolean(value: unknown): boolean {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    return ["true", "1", "yes", "checked", "complete", "completed"].includes(
      value.toLowerCase()
    );
  }
  return value === 1;
}

function getReturnedListType(rawType: string | undefined): string | undefined {
  if (!rawType) {
    return undefined;
  }
  switch (rawType.toUpperCase()) {
    case "SHOPPING":
      return "shopping";
    case "TODO":
      return "todo";
    case "OTHER":
      return "other";
    default:
      // Do not discard types introduced by a newer FamilyWall server.
      return rawType;
  }
}

function assertListType(value: unknown): asserts value is ListType {
  if (value !== "shopping" && value !== "todo" && value !== "other") {
    throw new FamilyWallValidationError(
      "List type must be one of: shopping, todo, or other"
    );
  }
}

function assertNonBlank(value: unknown, field: string): asserts value is string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new FamilyWallValidationError(`${field} must not be blank`);
  }
}

function parseListSummary(
  value: unknown,
  fallbackName?: string,
  fallbackType?: ListType,
  endpoint = "list-response"
): ListSummary {
  if (!isRecord(value)) {
    throw new FamilyWallApiError(
      "FamilyWall returned a malformed list",
      endpoint
    );
  }

  const id = getString(value, ["metaId", "taskListId", "listId", "id"]);
  if (!id || id.trim() === "") {
    throw new FamilyWallApiError(
      "FamilyWall returned a list without an identifier",
      endpoint
    );
  }

  const name = getString(value, ["name", "title"]) ?? fallbackName;
  if (name === undefined) {
    throw new FamilyWallApiError(
      "FamilyWall returned a list without a name",
      endpoint
    );
  }

  const type =
    getReturnedListType(getString(value, ["type", "taskListType"])) ??
    fallbackType;
  const itemCount = getNumber(value, ["itemCount"]);
  const checkedCount = getNumber(value, ["checkedCount"]);
  const color = getString(value, ["color"]);

  return {
    id,
    name,
    ...(type === undefined ? {} : { type }),
    ...(itemCount === undefined ? {} : { itemCount }),
    ...(checkedCount === undefined ? {} : { checkedCount }),
    ...(color === undefined ? {} : { color }),
  };
}

function parseListItem(value: unknown, endpoint = "list-response"): ListItem {
  if (!isRecord(value)) {
    throw new FamilyWallApiError(
      "FamilyWall returned a malformed list item",
      endpoint
    );
  }

  const id = getString(value, ["metaId", "taskId", "id"]);
  const text = getString(value, ["text", "name", "title"]);
  if (!id || id.trim() === "" || text === undefined) {
    throw new FamilyWallApiError(
      "FamilyWall returned a list item without an identifier or text",
      endpoint
    );
  }

  const completion =
    value.complete ?? value.completed ?? value.checked ?? value.isChecked;
  const quantity = value.quantity;
  const categories = Array.isArray(value.categories)
    ? value.categories
        .map((category) =>
          typeof category === "string"
            ? category
            : isRecord(category) && typeof category.name === "string"
              ? category.name
              : undefined
        )
        .filter((category): category is string => category !== undefined)
    : undefined;
  const authorId = getString(value, ["accountId", "authorId"]);
  const creationDate = getString(value, ["creationDate"]);

  return {
    id,
    text,
    completed: getBoolean(completion),
    ...(typeof quantity === "string" || typeof quantity === "number"
      ? { quantity }
      : {}),
    ...(authorId === undefined ? {} : { authorId }),
    ...(categories === undefined ? {} : { categories }),
    ...(creationDate === undefined ? {} : { creationDate }),
  };
}

function extractCollectionEntries(value: RawListCollectionResult): unknown[] {
  if (Array.isArray(value)) {
    return value;
  }
  if (isRecord(value)) {
    for (const key of ["lists", "taskLists", "tasklists", "results"]) {
      if (Array.isArray(value[key])) {
        return value[key];
      }
    }
  }
  throw new FamilyWallApiError(
    "FamilyWall returned a malformed list collection",
    "taskgettasklists"
  );
}

function extractCreateResult(value: RawListCreateResult): unknown {
  if (Array.isArray(value)) {
    if (value.length !== 1) {
      throw new FamilyWallApiError(
        "FamilyWall returned an unexpected list creation result",
        "taskcreatelist"
      );
    }
    return value[0];
  }
  if (isRecord(value)) {
    for (const key of ["list", "taskList", "result"]) {
      if (isRecord(value[key]) || typeof value[key] === "string") {
        return value[key];
      }
    }
  }
  return value;
}

function isOtherListType(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }
  const rawType = getString(value, ["type", "taskListType"]);
  const normalizedType = rawType?.toUpperCase();
  return normalizedType !== "SHOPPING" && normalizedType !== "TODO";
}

function matchesListType(value: unknown, requestedType: ListType): boolean {
  if (!isRecord(value)) {
    return false;
  }
  const rawType = getString(value, ["type", "taskListType"]);
  if (requestedType === "other") {
    return isOtherListType(value);
  }
  return rawType?.toUpperCase() === LIST_TYPE_TO_API[requestedType];
}

function parseThread(value: unknown, endpoint: string): Thread {
  if (!isRecord(value)) throw new FamilyWallApiError("FamilyWall returned a malformed thread", endpoint);
  const threadId = getString(value, ["metaId", "threadId", "id"]);
  if (!threadId || !Array.isArray(value.participants)) throw new FamilyWallApiError("FamilyWall returned a thread without an identifier or participants", endpoint);
  return { threadId, participants: value.participants.map((participant) => {
    if (!isRecord(participant)) throw new FamilyWallApiError("FamilyWall returned a malformed thread participant", endpoint);
    const accountId = getString(participant, ["accountId"]);
    const firstName = getString(participant, ["accountFirstname", "firstName"]);
    if (!accountId || firstName === undefined) throw new FamilyWallApiError("FamilyWall returned a thread participant without an identifier or name", endpoint);
    const lastReadMessageDate = getString(participant, ["lastReadMessageDate"]);
    return { accountId, firstName, ...(lastReadMessageDate === undefined ? {} : { lastReadMessageDate }) };
  }), unreadCount: getNumber(value, ["unreadCount"]) ?? 0, messageCount: getNumber(value, ["messageCount"]) ?? 0 };
}

function parseAttachment(value: unknown, endpoint: string): MessageAttachment {
  if (!isRecord(value)) throw new FamilyWallApiError("FamilyWall returned a malformed message attachment", endpoint);
  const id = getString(value, ["mediaId", "metaId", "id"]);
  if (!id) throw new FamilyWallApiError("FamilyWall returned an attachment without an identifier", endpoint);
  const name = getString(value, ["name"]), mimeType = getString(value, ["mimeType"]), size = getNumber(value, ["datasize", "size"]), pictureUrl = getString(value, ["pictureUrl"]), resolutionX = getNumber(value, ["resolutionX"]), resolutionY = getNumber(value, ["resolutionY"]), durationMs = getNumber(value, ["durationMs"]), readyState = getString(value, ["readystate", "readyState"]);
  return { id, ...(name === undefined ? {} : { name }), ...(mimeType === undefined ? {} : { mimeType }), ...(size === undefined ? {} : { size }), ...(pictureUrl === undefined ? {} : { pictureUrl }), ...(resolutionX === undefined ? {} : { resolutionX }), ...(resolutionY === undefined ? {} : { resolutionY }), ...(durationMs === undefined ? {} : { durationMs }), ...(readyState === undefined ? {} : { readyState }) };
}

function parseMessage(value: unknown, endpoint: string): Message {
  if (!isRecord(value)) throw new FamilyWallApiError("FamilyWall returned a malformed message", endpoint);
  const id = getString(value, ["metaId", "messageId", "id"]);
  if (!id) throw new FamilyWallApiError("FamilyWall returned a message without an identifier", endpoint);
  const medias = value.medias;
  if (medias !== undefined && !Array.isArray(medias)) throw new FamilyWallApiError("FamilyWall returned malformed message attachments", endpoint);
  const text = getString(value, ["text"]), authorId = getString(value, ["fromId", "authorAccountId"]), authorName = getString(value, ["authorFirstname"]), creationDate = getString(value, ["creationDate"]), type = getString(value, ["type"]);
  return { id, ...(text === undefined ? {} : { text }), ...(authorId === undefined ? {} : { authorId }), ...(authorName === undefined ? {} : { authorName }), ...(creationDate === undefined ? {} : { creationDate }), ...(type === undefined ? {} : { type }), attachments: (medias ?? []).map((media) => parseAttachment(media, endpoint)) };
}

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Offset between a timezone's wall clock and UTC at a given instant. */
function timezoneOffsetMs(instant: Date, timeZone: string): number {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts: Record<string, string> = {};
  for (const part of formatter.formatToParts(instant)) {
    if (part.type !== "literal") {
      parts[part.type] = part.value;
    }
  }
  const hour = Number(parts.hour) === 24 ? 0 : Number(parts.hour);
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    hour,
    Number(parts.minute),
    Number(parts.second),
    instant.getUTCMilliseconds()
  );
  return asUtc - instant.getTime();
}

/**
 * Resolves a wall-clock reading in `timeZone` to an instant. The second pass
 * re-reads the offset at the candidate instant so DST transitions resolve to
 * the offset actually in force rather than the one at the UTC guess.
 */
function zonedWallClockToInstant(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  milliseconds: number,
  timeZone: string
): Date {
  const guess = Date.UTC(year, month - 1, day, hour, minute, second, milliseconds);
  const firstPass = new Date(guess - timezoneOffsetMs(new Date(guess), timeZone));
  return new Date(guess - timezoneOffsetMs(firstPass, timeZone));
}

function resolveRangeBoundary(
  value: Date | string,
  field: string,
  timeZone: string,
  endOfDay: boolean
): Date {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      throw new FamilyWallValidationError(`${field} must be a valid date`);
    }
    return value;
  }
  assertNonBlank(value, field);
  if (DATE_ONLY_PATTERN.test(value)) {
    const [year, month, day] = value.split("-").map(Number) as [
      number,
      number,
      number,
    ];
    const resolved = zonedWallClockToInstant(
      year,
      month,
      day,
      endOfDay ? 23 : 0,
      endOfDay ? 59 : 0,
      endOfDay ? 59 : 0,
      endOfDay ? 999 : 0,
      timeZone
    );
    if (Number.isNaN(resolved.getTime())) {
      throw new FamilyWallValidationError(`${field} must be a valid date`);
    }
    return resolved;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new FamilyWallValidationError(`${field} must be a valid date`);
  }
  return parsed;
}

function extractEventEntries(value: unknown, endpoint: string): unknown[] {
  if (Array.isArray(value)) {
    return value;
  }
  if (isRecord(value)) {
    for (const key of ["events", "datas", "updatedCreated", "results"]) {
      if (Array.isArray(value[key])) {
        return value[key];
      }
    }
  }
  throw new FamilyWallApiError(
    "FamilyWall returned a malformed event collection",
    endpoint
  );
}

/**
 * Credentials are only ever attached to FamilyWall's own hosts. Media may be
 * served from a CDN that must not receive the session cookie or CSRF token.
 */
function isCredentialedMediaOrigin(url: URL): boolean {
  return (
    url.protocol === "https:" &&
    (url.hostname === "familywall.com" || url.hostname.endsWith(".familywall.com"))
  );
}

function assertSafeMediaUrl(value: string, field: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new FamilyWallValidationError(`${field} must be a valid absolute URL`);
  }
  if (url.protocol !== "https:") {
    throw new FamilyWallValidationError(`${field} must use https`);
  }
  if (url.username !== "" || url.password !== "") {
    throw new FamilyWallValidationError(`${field} must not embed credentials`);
  }
  return url;
}

/** Reduces a server-supplied name to a bare basename so it cannot traverse paths. */
function sanitizeFilename(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  const basename = value.split(/[\\/]/).pop()?.replace(/^\.+/, "").trim();
  return basename === undefined || basename === "" ? undefined : basename;
}

/** Enforces a byte ceiling while reading, independent of any Content-Length. */
function boundedStream(
  source: ReadableStream<Uint8Array>,
  maxBytes: number | undefined,
  endpoint: string
): ReadableStream<Uint8Array> {
  if (maxBytes === undefined) {
    return source;
  }
  let read = 0;
  const reader = source.getReader();
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { done, value } = await reader.read();
      if (done) {
        controller.close();
        return;
      }
      read += value.byteLength;
      if (read > maxBytes) {
        await reader.cancel();
        controller.error(
          new FamilyWallApiError(
            "Attachment exceeded the maximum download size",
            endpoint
          )
        );
        return;
      }
      controller.enqueue(value);
    },
    async cancel(reason) {
      await reader.cancel(reason);
    },
  });
}

const EXPLICIT_OFFSET = /(Z|[+-]\d{2}:?\d{2})$/i;

function zoneOffsetMs(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);
  const get = (type: string) =>
    Number(parts.find((part) => part.type === type)?.value);
  const wallClockAsUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second")
  );
  return wallClockAsUtc - instant.getTime();
}

/**
 * Convert a date/time to the `YYYY-MM-DDTHH:mm:ss` UTC wall-clock string
 * that `evtcreate`/`evtupdate` expect. The API interprets `startDate` and
 * `endDate` as UTC no matter which `timeZone` is sent along, so a value
 * without an explicit offset is interpreted in `timeZone` and shifted.
 * Values with an explicit offset (`Z`, `+02:00`) are used as that instant.
 */
export function toApiDateTime(value: string, timeZone: string): string {
  if (EXPLICIT_OFFSET.test(value)) {
    return new Date(value).toISOString().slice(0, 19);
  }
  const naive = new Date(`${value}Z`);
  if (Number.isNaN(naive.getTime())) {
    throw new Error(`Invalid date/time: ${value}`);
  }
  // Two passes so the offset is evaluated at the resulting instant (DST edges).
  const firstGuess = new Date(naive.getTime() - zoneOffsetMs(naive, timeZone));
  const instant = new Date(naive.getTime() - zoneOffsetMs(firstGuess, timeZone));
  return instant.toISOString().slice(0, 19);
}

export default class FamilyWallClient {
  private readonly baseUrl: string;
  private readonly fetcher: typeof fetch;
  private cookie: string | null;
  private jsessionid: string | null;
  private readonly timezone: string;
  private members: Record<string, RawProfile> | null;
  private family: unknown;
  private webSocketUrl: string | undefined;

  constructor(options: FamilyWallClientOptions = {}) {
    this.baseUrl = "https://api.familywall.com/api";
    const fetchImplementation = options.fetch ?? globalThis.fetch;
    if (!fetchImplementation) {
      throw new Error("A fetch implementation is required");
    }
    this.fetcher = fetchImplementation.bind(globalThis);
    this.cookie = null;
    this.jsessionid = null;
    this.timezone =
      options.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
    this.members = null;
    this.family = null;
  }

  async apiFetch(
    endpoint: string,
    body: Record<string, string | number | boolean>,
    method: string = "POST"
  ): Promise<Response> {
    const serialized = serialize(body);
    const headers: Record<string, string> = {
      accept: "application/json, text/javascript, */*; q=0.01",
      "accept-language": "en-US,en;q=0.9",
      "cache-control": "no-cache",
      "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
      pragma: "no-cache",
      priority: "u=1, i",
      "sec-ch-ua":
        '"Chromium";v="128", "Not;A=Brand";v="24", "Google Chrome";v="128"',
      "sec-ch-ua-mobile": "?0",
      "sec-ch-ua-platform": '"Windows"',
      "sec-fetch-dest": "empty",
      "sec-fetch-mode": "cors",
      "sec-fetch-site": "same-site",
      Referer: "https://www.familywall.com/",
      "Referrer-Policy": "strict-origin-when-cross-origin",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
      "content-length": String(new TextEncoder().encode(serialized).byteLength),
    };

    if (this.jsessionid) {
      headers["tokencsrf"] = this.jsessionid;
      headers["cookie"] = this.cookie!;
    }

    return await this.fetcher(`${this.baseUrl}/${endpoint}`, {
      headers,
      body: serialized,
      method,
    });
  }

  private async readApiResponse<T>(
    endpoint: string,
    response: Response,
    redactApiError = false
  ): Promise<T> {
    if (!response.ok) {
      throw new FamilyWallApiError(
        `FamilyWall request failed with HTTP ${response.status}`,
        endpoint,
        { status: response.status }
      );
    }

    let json: unknown;
    try {
      json = await response.json();
    } catch (cause) {
      throw new FamilyWallApiError(
        "FamilyWall returned invalid JSON",
        endpoint,
        { status: response.status, cause }
      );
    }

    if (!isRecord(json) || !isRecord(json.a00)) {
      throw new FamilyWallApiError(
        "FamilyWall returned a malformed response envelope",
        endpoint,
        { status: response.status }
      );
    }

    const call = json.a00;
    if ("ex" in call) {
      const error = call.ex;
      const message =
        typeof error === "string"
          ? error
          : isRecord(error) && isRecord(error.ex) && typeof error.ex.message === "string"
            ? error.ex.message
            : "Unknown FamilyWall API error";
      throw new FamilyWallApiError(
        redactApiError ? "FamilyWall API returned an error" : `FamilyWall API error: ${message}`,
        endpoint,
        redactApiError ? { status: response.status } : { status: response.status, apiError: error }
      );
    }

    if (!isRecord(call.r) || !("r" in call.r)) {
      throw new FamilyWallApiError(
        "FamilyWall returned a response without a result",
        endpoint,
        { status: response.status }
      );
    }

    return call.r.r as T;
  }

  async login(
    email: string,
    password: string,
    attempts: number = 0
  ): Promise<void> {
    const body = {
      partnerScope: "Family",
      a01call: "log2get",
      transactional: true,
      a00generateAutologinToken: true,
      a00identifier: email,
      a00password: password,
    };

    const response = await this.apiFetch("log2in", body);
    const responseHeaders = response.headers;
    this.jsessionid =
      responseHeaders
        .get("set-cookie")
        ?.split(";")?.[0]
        ?.replace("JSESSIONID=", "") ?? null;
    if (!this.jsessionid) {
      if (attempts < 3) {
        await this.login(email, password, attempts + 1);
        return;
      }
      console.error("Failed to login");
      return;
    }
    this.cookie = setCookie(this.jsessionid);

    await this._webset();
    await this._webget();
  }

  async getWebSocketUrl(): Promise<string | undefined> {
    const body = {
      partnerScope: "Family",
    };

    const response = await this.apiFetch("webgetWebSocketUrl", body);
    const json = (await response.json()) as WebSocketUrlResponse;

    return (this.webSocketUrl = json?.a00?.r?.r);
  }

  private async _webset(): Promise<unknown> {
    const body = {
      partnerScope: "Family",
      var: "a",
      value: "t",
    };
    const response = await this.apiFetch("webset", body);
    const json: unknown = await response.json();
    return json;
  }

  private async _webget(): Promise<unknown> {
    const body = {
      partnerScope: "Family",
      var: "a",
    };

    const response = await this.apiFetch("webget", body);
    return (await response.json()) as unknown;
  }

  private eventBody(event: CreateEventRequest): Record<string, string | number | boolean> {
    const { allDay = false, startDate, endDate, ...rest } = event;
    return {
      partnerScope: "Family",
      picture: "$empty",
      timeZone: this.timezone,
      isToAll: "false",
      private: "",
      recurrencyInterval: "1",
      recurrency: "NONE",
      byDay: "",
      byMonthDay: "",
      recurrencyEndDate: "$empty",
      reminderList: "$empty",
      ...rest,
      allDay: allDay ? "true" : "false",
      // All-day events keep their local day boundaries (T00:00:00 / T23:59:59).
      startDate: allDay ? startDate : toApiDateTime(startDate, this.timezone),
      endDate: allDay ? endDate : toApiDateTime(endDate, this.timezone),
    };
  }

  async updateEvent(eventId: string, event: CreateEventRequest): Promise<CalendarEvent> {
    const body = { metaId: eventId, ...this.eventBody(event) };
    const response = await this.apiFetch("evtupdate", body);
    const json = await response.json() as EventCreateResponse;
    return json.a00.r.r;
  }

  async createEvent(event: CreateEventRequest): Promise<CalendarEvent> {
    const body = this.eventBody(event);
    const response = await this.apiFetch("evtcreate", body);
    const json = await response.json() as EventCreateResponse;
    return json.a00.r.r;
  }

  async deleteEvent(eventId: string): Promise<boolean> {
    const body = {
      partnerScope: "Family",
      option: "All",
      "eventId.0": eventId
    }
    const response = await this.apiFetch("evtdelete", body);
    const json = await response.json() as EventDeleteResponse;
    return json.a00.r.r === "true";
  }

  async getCalendar(calendarId: string) {
    const body = {
      partnerScope: "Family",
      calendarId,
      a01call: "evtcallist",
      a01withtask: "true",
      a01withmeal: "true",
      a01withfolder: "true",
      a01withAllFamilies: "true",
      a01withExternal: "true",
      a01withOnError: "true"
    }

    const response = await this.apiFetch("evtsync", body);
    const json = (await response.json()) as EventSyncResponse;
    return json.a00.r.r;
  }

  private resolveCalendarRange(options: GetCalendarRangeOptions): {
    from: Date;
    to: Date;
  } {
    const { startDate, endDate, days } = options;
    if (days !== undefined && endDate !== undefined) {
      throw new FamilyWallValidationError(
        "days cannot be combined with endDate"
      );
    }
    if (startDate === undefined && endDate === undefined && days === undefined) {
      throw new FamilyWallValidationError(
        "A range requires startDate, endDate, or days"
      );
    }
    if (days !== undefined && (!Number.isInteger(days) || days <= 0)) {
      throw new FamilyWallValidationError("days must be a positive integer");
    }

    const from =
      startDate === undefined
        ? new Date()
        : resolveRangeBoundary(startDate, "startDate", this.timezone, false);
    const to =
      days !== undefined
        ? new Date(from.getTime() + days * 86_400_000)
        : endDate === undefined
          ? new Date()
          : resolveRangeBoundary(endDate, "endDate", this.timezone, true);

    if (to.getTime() < from.getTime()) {
      throw new FamilyWallValidationError("endDate must not precede startDate");
    }
    return { from, to };
  }

  /**
   * Ranged calendar read. This is separate from `getCalendar` because
   * `evtlistinterval` returns an event collection rather than a sync payload,
   * and adapting it into the sync shape would mean fabricating sync metadata.
   * Server-side recurrence and overlap semantics are not established.
   */
  async getCalendarEventsInRange(
    calendarId: string,
    options: GetCalendarRangeOptions = {}
  ): Promise<CalendarEvent[]> {
    assertNonBlank(calendarId, "calendarId");
    const { from, to } = this.resolveCalendarRange(options);

    const response = await this.apiFetch("evtlistinterval", {
      partnerScope: "Family",
      calendarId,
      a00from: from.toISOString(),
      a00to: to.toISOString(),
    });
    const result = await this.readApiResponse<unknown>(
      "evtlistinterval",
      response
    );
    return extractEventEntries(result, "evtlistinterval") as CalendarEvent[];
  }

  async getLists(options: GetListsOptions = {}): Promise<ListSummary[]> {
    const requestedType = options?.type;
    if (requestedType !== undefined) {
      assertListType(requestedType);
    }

    const response = await this.apiFetch("taskgettasklists", {
      partnerScope: "Family",
    });
    const result = await this.readApiResponse<RawListCollectionResult>(
      "taskgettasklists",
      response
    );
    const entries = extractCollectionEntries(result);

    return entries
      .filter((entry) =>
        requestedType === undefined ? true : matchesListType(entry, requestedType)
      )
      .map((entry) => parseListSummary(entry, undefined, undefined, "taskgettasklists"));
  }

  async getList(listId: string): Promise<ListDetails> {
    assertNonBlank(listId, "listId");

    const response = await this.apiFetch("tasklist", {
      partnerScope: "Family",
      a00listId: listId,
    });
    const result = await this.readApiResponse<RawListDetailResult>(
      "tasklist",
      response
    );

    let metadata: Record<string, unknown> | undefined;
    let itemValues: unknown[] | undefined;
    if (Array.isArray(result)) {
      itemValues = result;
    } else if (isRecord(result)) {
      metadata = isRecord(result.list)
        ? result.list
        : isRecord(result.taskList)
          ? result.taskList
          : result;
      for (const key of ["items", "tasks", "listItems"]) {
        if (Array.isArray(result[key])) {
          itemValues = result[key];
          break;
        }
        if (metadata !== result && Array.isArray(metadata[key])) {
          itemValues = metadata[key];
          break;
        }
      }
      if (itemValues === undefined) {
        const hasMetadata =
          getString(metadata, ["metaId", "taskListId", "listId", "id", "name"]) !==
          undefined;
        if (!hasMetadata) {
          throw new FamilyWallApiError(
            "FamilyWall returned a malformed list detail",
            "tasklist"
          );
        }
        itemValues = [];
      }
    } else {
      throw new FamilyWallApiError(
        "FamilyWall returned a malformed list detail",
        "tasklist"
      );
    }

    const details: ListDetails = {
      id: listId,
      items: itemValues.map((item) => parseListItem(item, "tasklist")),
    };
    if (metadata) {
      const name = getString(metadata, ["name", "title"]);
      const type = getReturnedListType(
        getString(metadata, ["type", "taskListType"])
      );
      const itemCount = getNumber(metadata, ["itemCount"]);
      const checkedCount = getNumber(metadata, ["checkedCount"]);
      const color = getString(metadata, ["color"]);
      if (name !== undefined) details.name = name;
      if (type !== undefined) details.type = type;
      if (itemCount !== undefined) details.itemCount = itemCount;
      if (checkedCount !== undefined) details.checkedCount = checkedCount;
      if (color !== undefined) details.color = color;
    }
    return details;
  }

  async createList(input: CreateListRequest): Promise<ListSummary> {
    assertNonBlank(input?.name, "name");
    assertListType(input?.type);

    const response = await this.apiFetch("taskcreatelist", {
      partnerScope: "Family",
      a00name: input.name,
      a00taskListType: LIST_TYPE_TO_API[input.type],
    });
    const result = await this.readApiResponse<RawListCreateResult>(
      "taskcreatelist",
      response
    );
    const created = extractCreateResult(result);
    if (typeof created === "string") {
      return {
        id: created,
        name: input.name,
        type: input.type,
      };
    }
    return parseListSummary(created, input.name, input.type, "taskcreatelist");
  }

  async addListItem(listId: string, input: AddListItemRequest): Promise<ListItem> {
    assertNonBlank(listId, "listId");
    assertNonBlank(input?.text, "text");
    const quantity = input.quantity;
    if (
      quantity !== undefined &&
      typeof quantity !== "string" &&
      typeof quantity !== "number"
    ) {
      throw new FamilyWallValidationError("quantity must be a string or number");
    }

    const response = await this.apiFetch("taskcreate", {
      partnerScope: "Family",
      a00taskListId: listId,
      a00text: input.text,
      ...(quantity === undefined ? {} : { a00quantity: quantity }),
    });
    const result = await this.readApiResponse<unknown>("taskcreate", response);
    const created = extractCreateResult(result as RawListCreateResult);
    if (typeof created === "string") {
      return {
        id: created,
        text: input.text,
        completed: false,
        ...(quantity === undefined ? {} : { quantity }),
      };
    }
    return parseListItem(created, "taskcreate");
  }

  /**
   * Takes an explicit completion state rather than toggling, so that repeating
   * a request cannot invert the item. `taskmark` is documented only with
   * `a00taskId`, so no list identifier is sent and none is accepted here.
   * Success is the absence of an API error; the acknowledgement shape is not
   * established, so nothing is fabricated from it.
   */
  async setListItemCompleted(itemId: string, completed: boolean): Promise<void> {
    assertNonBlank(itemId, "itemId");
    if (typeof completed !== "boolean") {
      throw new FamilyWallValidationError("completed must be a boolean");
    }

    const response = await this.apiFetch("taskmark", {
      partnerScope: "Family",
      a00taskId: itemId,
      a00complete: completed,
    });
    await this.readApiResponse<unknown>("taskmark", response);
  }

  /**
   * Fetches the account's current thread summaries. This is intentionally not a
   * Family facade method: the reference protocol does not establish family scope.
   */
  async getThreads(): Promise<Thread[]> {
    const response = await this.apiFetch("imthreadlist", {
      partnerScope: "Family",
      a00isLoggedFamily: false,
    });
    const result = await this.readApiResponse<unknown>("imthreadlist", response, true);
    if (!Array.isArray(result)) {
      throw new FamilyWallApiError("FamilyWall returned a malformed thread collection", "imthreadlist");
    }
    return result.map((thread) => parseThread(thread, "imthreadlist"));
  }

  /** Fetches one bounded message page; ordering and continuation are not established. */
  async getThreadMessages(
    threadId: string,
    options: GetThreadMessagesOptions = {}
  ): Promise<MessagePage> {
    assertNonBlank(threadId, "threadId");
    const limit = options.limit ?? 20;
    if (!Number.isInteger(limit) || limit <= 0) {
      throw new FamilyWallValidationError("limit must be a positive integer");
    }
    const response = await this.apiFetch("immessagelist2", {
      partnerScope: "Family",
      a00threadId: threadId,
      a00limit: limit,
    });
    const result = await this.readApiResponse<unknown>("immessagelist2", response, true);
    const page = Array.isArray(result) ? { datas: result } : result;
    if (!isRecord(page) || !Array.isArray(page.datas)) {
      throw new FamilyWallApiError("FamilyWall returned a malformed message page", "immessagelist2");
    }
    const size = getNumber(page, ["size"]), count = getNumber(page, ["count"]), start = getNumber(page, ["start"]);
    return { messages: page.datas.map((message) => parseMessage(message, "immessagelist2")), ...(size === undefined ? {} : { size }), ...(count === undefined ? {} : { count }), ...(start === undefined ? {} : { start }) };
  }

  /**
   * Sends one text message. This is never retried automatically: a lost
   * response may follow a successful send, and retrying would risk delivering
   * the message twice. Callers that see a network failure must decide for
   * themselves whether to re-read the thread before resending.
   */
  async sendMessage(threadId: string, input: SendMessageRequest): Promise<Message> {
    assertNonBlank(threadId, "threadId");
    assertNonBlank(input?.text, "text");

    const response = await this.apiFetch("imsend", {
      partnerScope: "Family",
      a00threadId: threadId,
      a00text: input.text,
    });
    const result = await this.readApiResponse<unknown>("imsend", response, true);
    if (typeof result === "string" && result.trim() !== "") {
      return { id: result, text: input.text, attachments: [] };
    }
    return parseMessage(result, "imsend");
  }

  /**
   * Streams one attachment's bytes. Session credentials are attached only for
   * FamilyWall's own hosts, redirects are resolved manually so that a redirect
   * off-origin drops those credentials rather than leaking them to a CDN, and
   * the size ceiling is enforced while reading because Content-Length may be
   * absent or wrong.
   */
  async downloadAttachment(
    attachment: MessageAttachment,
    options: DownloadAttachmentOptions = {}
  ): Promise<AttachmentDownload> {
    const source = attachment?.pictureUrl;
    if (typeof source !== "string" || source.trim() === "") {
      throw new FamilyWallValidationError(
        "attachment must have a pictureUrl to download"
      );
    }
    const { maxBytes } = options;
    if (
      maxBytes !== undefined &&
      (!Number.isInteger(maxBytes) || maxBytes <= 0)
    ) {
      throw new FamilyWallValidationError("maxBytes must be a positive integer");
    }

    let target = assertSafeMediaUrl(source, "pictureUrl");
    let response: Response | undefined;

    for (let redirects = 0; redirects <= 5; redirects += 1) {
      const headers: Record<string, string> = { accept: "*/*" };
      if (this.jsessionid && isCredentialedMediaOrigin(target)) {
        headers["tokencsrf"] = this.jsessionid;
        headers["cookie"] = this.cookie!;
      }

      response = await this.fetcher(target.toString(), {
        method: "GET",
        headers,
        redirect: "manual",
        ...(options.signal === undefined ? {} : { signal: options.signal }),
      });

      if (response.status < 300 || response.status >= 400) {
        break;
      }
      const location = response.headers.get("location");
      if (location === null) {
        throw new FamilyWallApiError(
          "FamilyWall returned a redirect without a destination",
          "attachment-download",
          { status: response.status }
        );
      }
      target = assertSafeMediaUrl(
        new URL(location, target).toString(),
        "redirect location"
      );
      response = undefined;
    }

    if (response === undefined) {
      throw new FamilyWallApiError(
        "Attachment download exceeded the redirect limit",
        "attachment-download"
      );
    }
    if (!response.ok) {
      throw new FamilyWallApiError(
        `Attachment download failed with HTTP ${response.status}`,
        "attachment-download",
        { status: response.status }
      );
    }
    if (response.body === null) {
      throw new FamilyWallApiError(
        "FamilyWall returned an attachment without a body",
        "attachment-download",
        { status: response.status }
      );
    }

    const mimeType =
      response.headers.get("content-type")?.split(";")[0]?.trim() ||
      attachment.mimeType;
    const declaredSize = getNumber(
      { length: response.headers.get("content-length") ?? "" },
      ["length"]
    );
    const filename = sanitizeFilename(attachment.name);

    return {
      url: target.toString(),
      ...(mimeType === undefined || mimeType === "" ? {} : { mimeType }),
      ...(declaredSize === undefined ? {} : { size: declaredSize }),
      ...(filename === undefined ? {} : { filename }),
      body: boundedStream(response.body, maxBytes, "attachment-download"),
    };
  }

  async getAllFamily(): Promise<AllFamilyResponse> {
    const body = {
      partnerScope: "Family",
      a01call: "prfgetProfiles",
      a02call: "famlistfamily",
      a03call: "settingsgetperfamily",
      a04call: "famshowincominginvite",
      a05call: "imthreadlist",
      a05isLoggedFamily: false,
      a06call: "accgetstate",
      a06deviceId: "webm16skcc5so1b181l4o",
      a06modelType: "WebFirebase",
      a06applicationVersion: "",
      a06timezone: this.timezone,
    };

    const response = await this.apiFetch("accgetallfamily", body);
    const json = (await response.json()) as AllFamilyResponse;
    this.members = json?.a01?.r?.r ?? null;
    this.family = json?.a02?.r?.r ?? null;
    return json;
  }

  async getFamily(): Promise<Family> {
    return new Family(await this.getAllFamily(), this);
  }
}
