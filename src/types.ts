// ===== Raw API Types (data from FamilyWall API before processing) =====

export interface RawDevice {
  deviceType: string;
  deviceId: string;
  value: string;
}

export interface RawIdentifier {
  type: string;
  value: string;
  validated: string;
}

export interface RawMediaRights {
  canUpdate?: string;
  canDelete?: string;
}

export interface RawMedia {
  pictureUrl: string;
  rights?: RawMediaRights;
}

export interface RawCoverMedia {
  pictureUrl: string;
  resolutionX: number;
  resolutionY: number;
  creationDate: string;
  mimeType: string;
}

export interface RawMemberRights {
  canUpdate?: boolean;
  canDelete?: boolean;
}

export interface RawMember {
  firstName: string;
  role: string;
  lastLoginDate: string;
  joinDate: string;
  profileFamilyId: string;
  pictureURI?: string;
  timeZone: string;
  right: string;
  devices: RawDevice[];
  identifiers: RawIdentifier[];
  medias: RawMedia[];
  rights?: RawMemberRights;
}

export interface RawProfile {
  firstName: string;
  timeZone: string;
  accountId: string;
  pictureURI?: string;
  devices?: RawDevice[];
  medias: RawMedia[];
}

export interface RawFamilySettings {
  familyId: string;
  defaultReminderValue: string;
  geolocSharing: string;
  calendarFirstDayOfWeek: string;
}

export interface RawThreadParticipant {
  accountId: string;
  accountFirstname: string;
  lastReadMessageDate: string;
}

export interface RawThread {
  metaId: string;
  participants: RawThreadParticipant[];
  unreadCount: number;
  messageCount: number;
}

export interface RawPremium {
  fWPremiumMemberSubscriber: boolean;
  familyQuota: number;
  geoFencingActivated: boolean;
  audio: boolean;
  videoAvailable: boolean;
}

// ===== API Response Structure =====

export interface ApiResponseWrapper<T> {
  r: {
    r: T;
  };
}

export interface FamilyDataPayload {
  family_id: string;
  members: RawMember[];
  coverMedias: RawCoverMedia[];
}

export interface AccountStatePayload {
  premium: RawPremium;
}

export interface CreateEventRequest {
  text: string;
  /**
   * `YYYY-MM-DDTHH:mm:ss` in the client's `timezone`, or an ISO string with an
   * explicit offset (`Z`, `+02:00`). For all-day events pass the local day
   * boundaries (`YYYY-MM-DDT00:00:00` / `YYYY-MM-DDT23:59:59`).
   */
  startDate: string;
  /** See `startDate`. */
  endDate: string;
  color: string;
  where: string;
  description: string;
  /** Create an all-day event. Defaults to `false`. */
  allDay?: boolean;
}

export interface CalendarEvent {
  eventId: string;
  description: string;
  text: string;
  where: string;
  startDate: string;
  endDate: string;
}

export interface EventDataPayload {
  updatedCreated: CalendarEvent[]
}

export interface EventCreateResponse {
  a00: ApiResponseWrapper<CalendarEvent>
}

export interface EventDeleteResponse {
  a00: ApiResponseWrapper<"true" | "false">
}

export interface EventSyncResponse {
  a00: ApiResponseWrapper<EventDataPayload>
}

export interface RawListCategory {
  name?: string;
  [key: string]: unknown;
}

export interface RawListItem {
  metaId?: string;
  taskId?: string;
  id?: string;
  text?: string;
  name?: string;
  title?: string;
  complete?: boolean | string;
  completed?: boolean | string;
  checked?: boolean | string;
  isChecked?: boolean | string;
  quantity?: string | number;
  accountId?: string;
  categories?: Array<RawListCategory | string>;
  creationDate?: string;
  [key: string]: unknown;
}

export interface RawList {
  metaId?: string;
  taskListId?: string;
  listId?: string;
  id?: string;
  name?: string;
  type?: string;
  taskListType?: string;
  itemCount?: number | string;
  checkedCount?: number | string;
  color?: string;
  items?: RawListItem[];
  tasks?: RawListItem[];
  listItems?: RawListItem[];
  [key: string]: unknown;
}

export interface RawApiError {
  message?: string;
  [key: string]: unknown;
}

export interface RawApiResult<T> {
  r: T;
}

export interface RawApiCall<T> {
  r?: RawApiResult<T>;
  ex?: {
    ex?: RawApiError | string;
    [key: string]: unknown;
  };
  cn?: string;
  [key: string]: unknown;
}

export interface RawApiResponse<T> {
  a00?: RawApiCall<T>;
  [key: string]: unknown;
}

export type RawListCollectionResult = RawList[] | {
  lists?: RawList[];
  taskLists?: RawList[];
  [key: string]: unknown;
};

export type RawListDetailResult = RawList | RawListItem[];

export type RawListCreateResult = RawList | string | RawList[];

export interface AllFamilyResponse {
  a00: ApiResponseWrapper<FamilyDataPayload>;
  a01?: ApiResponseWrapper<Record<string, RawProfile>>;
  a02?: ApiResponseWrapper<unknown>;
  a03?: ApiResponseWrapper<RawFamilySettings>;
  a04?: ApiResponseWrapper<unknown>;
  a05?: ApiResponseWrapper<RawThread[]>;
  a06?: ApiResponseWrapper<AccountStatePayload>;
}

export interface WebSocketUrlResponse {
  a00?: ApiResponseWrapper<string>;
}

// ===== Processed Output Types =====

export interface MemberDevice {
  deviceType: string;
  deviceId: string;
  value: string;
}

export interface MemberIdentifier {
  type: string;
  value: string;
  validated: boolean;
}

export interface MemberMedia {
  pictureUrl: string;
  canUpdate: string | boolean;
  canDelete: string | boolean;
}

export interface MemberRights {
  canUpdate: boolean;
  canDelete: boolean;
}

export interface Member {
  firstName: string;
  email: string | undefined;
  role: string;
  lastLoginDate: string;
  joinDate: string;
  profileFamilyId: string;
  pictureURI: string | undefined;
  timeZone: string;
  right: string;
  devices: MemberDevice[];
  identifiers: MemberIdentifier[];
  medias: MemberMedia[];
  rights: MemberRights;
}

export interface FamilySettings {
  familyId: string;
  reminderValue: string;
  geolocSharing: string;
  calendarFirstDayOfWeek: string;
}

export interface FamilyCoverMedia {
  pictureUrl: string;
  resolution: string;
  creationDate: string;
  mimeType: string;
}

export interface ThreadParticipant {
  accountId: string;
  firstName: string;
  lastReadMessageDate?: string;
}

export interface Thread {
  threadId: string;
  participants: ThreadParticipant[];
  unreadCount: number;
  messageCount: number;
}

export interface PremiumDetails {
  premiumMember: boolean;
  familyQuota: number;
  premiumFeatures: {
    geoFencing: boolean;
    audioAvailable: boolean;
    videoAvailable: boolean;
  };
}

export interface ProfileDetails {
  firstName: string;
  email: string | undefined;
  timeZone: string;
  accountId: string;
  pictureURI: string | undefined;
  medias: MemberMedia[];
}

export interface FamilyWallClientOptions {
  timezone?: string;
  fetch?: typeof fetch;
}

// ===== Lists =====

export type ListType = "shopping" | "todo" | "other";

export interface GetListsOptions {
  type?: ListType;
}

export interface CreateListRequest {
  name: string;
  type: ListType;
}

export type ListTypeValue = ListType | (string & {});

export interface ListSummary {
  id: string;
  name: string;
  type?: ListTypeValue;
  itemCount?: number;
  checkedCount?: number;
  color?: string;
}

export interface ListItem {
  id: string;
  text: string;
  completed: boolean;
  quantity?: string | number;
  authorId?: string;
  categories?: string[];
  creationDate?: string;
}

export interface ListDetails {
  id: string;
  name?: string;
  type?: ListTypeValue;
  itemCount?: number;
  checkedCount?: number;
  color?: string;
  items: ListItem[];
}

export interface AddListItemRequest {
  text: string;
  quantity?: string | number;
}

// ===== Calendar ranges =====

export interface GetCalendarRangeOptions {
  /** Date-only values are resolved against the client's configured timezone. */
  startDate?: Date | string;
  endDate?: Date | string;
  /** Positive whole number of days from `startDate`, or from now when omitted. */
  days?: number;
}

// ===== Messaging =====

export interface MessageAttachment {
  id: string;
  name?: string;
  mimeType?: string;
  size?: number;
  pictureUrl?: string;
  resolutionX?: number;
  resolutionY?: number;
  durationMs?: number;
  readyState?: string;
}

export interface Message {
  id: string;
  text?: string;
  authorId?: string;
  authorName?: string;
  creationDate?: string;
  type?: string;
  attachments: MessageAttachment[];
}

export interface GetThreadMessagesOptions {
  /** Number of messages to request; the server continuation contract is unknown. */
  limit?: number;
}

export interface MessagePage {
  messages: Message[];
  size?: number;
  count?: number;
  start?: number;
}

export interface SendMessageRequest {
  text: string;
}

export interface DownloadAttachmentOptions {
  signal?: AbortSignal;
  /** Rejects the download once this many bytes have been read. */
  maxBytes?: number;
}

export interface AttachmentDownload {
  url: string;
  mimeType?: string;
  /** Content-Length when the server supplies one; it is not enforced as truth. */
  size?: number;
  /** Server-supplied name stripped to a bare basename; still untrusted. */
  filename?: string;
  body: ReadableStream<Uint8Array>;
}
