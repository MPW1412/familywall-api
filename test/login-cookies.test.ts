import assert from "node:assert/strict";
import test from "node:test";
import FamilyWallClient from "../src/client.js";
import { envelope, mockFetch, rejectUnexpected } from "./support.js";

test("login picks JSESSIONID even when other cookies come first", async () => {
  const mock = mockFetch((call) => {
    if (call.url.endsWith("/log2in")) {
      const response = envelope({ accountId: "1" });
      response.headers.append("set-cookie", "AWSALB=lb-1; Expires=Thu, 15 Oct 2026 09:17:48 GMT; Path=/");
      response.headers.append("set-cookie", "AWSALBCORS=lb-1; Path=/; SameSite=None; Secure");
      response.headers.append("set-cookie", "JSESSIONID=session-42; Path=/; Secure; HttpOnly");
      return response;
    }
    if (call.url.endsWith("/webset") || call.url.endsWith("/webget")) {
      return envelope("ok");
    }
    rejectUnexpected(call);
  });
  const client = new FamilyWallClient({ fetch: mock.fetcher, timezone: "UTC" });

  await client.login("user@example.com", "secret");

  assert.equal(mock.calls.length, 3, "login, webset and webget");
  const authenticated = mock.calls[1]!;
  assert.equal(authenticated.headers["tokencsrf"], "session-42");
  const cookie = authenticated.headers["cookie"] ?? "";
  assert.match(cookie, /(^|; )JSESSIONID=session-42(;|$)/);
  assert.match(cookie, /(^|; )AWSALB=lb-1(;|$)/, "load-balancer cookies are sent back");
  assert.doesNotMatch(cookie, /_ga=/, "no fabricated analytics cookies");
});
