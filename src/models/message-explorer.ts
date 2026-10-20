// @group Types : Browser-safe contracts for bounded, partition-specific message browsing
export type ExplorerEncoding = 'utf8' | 'base64';

export interface ExplorerMessage {
  topic: string;
  partition: number;
  offset: string;
  timestamp: string | null;
  key: string | null;
  value: string | null;
  headers: Record<string, string | null | Array<string | null>>;
  encoding: {
    key: ExplorerEncoding;
    value: ExplorerEncoding;
    headers: Record<string, ExplorerEncoding | null | Array<ExplorerEncoding | null>>;
  };
}

export type ExplorerStart =
  | { kind: 'earliest' | 'latest' }
  | { kind: 'offset'; offset: string }
  | { kind: 'timestamp'; timestamp: string };

export interface ExplorerCursor {
  profileId: string;
  topic: string;
  partition: number;
  connectionId: string;
  nextOffset: string;
  endOffset: string;
}

export interface BrowseMessagesRequest {
  profileId: string;
  topic: string;
  partition: number;
  limit?: number;
  start?: ExplorerStart;
  cursor?: ExplorerCursor;
}

export interface BrowseMessagesResponse {
  messages: ExplorerMessage[];
  nextCursor: ExplorerCursor | null;
  lowOffset: string;
  highOffset: string;
  complete: boolean;
  timedOut: boolean;
  warnings: string[];
}
