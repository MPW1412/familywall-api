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
  private cookie: string | null;
  private jsessionid: string | null;
  private readonly timezone: string;
  private members: Record<string, RawProfile> | null;
  private family: unknown;
  private webSocketUrl: string | undefined;

  constructor(options: FamilyWallClientOptions = {}) {
    this.baseUrl = "https://api.familywall.com/api";
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
      "content-length": String(serialized.length),
    };

    if (this.jsessionid) {
      headers["tokencsrf"] = this.jsessionid;
      headers["cookie"] = this.cookie!;
    }

    return await fetch(`${this.baseUrl}/${endpoint}`, {
      headers,
      body: serialized,
      method,
    });
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
