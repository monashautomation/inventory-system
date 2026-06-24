const NOTION_BASE = "https://api.notion.com/v1";
const NOTION_VERSION = "2022-06-28";

export class NotionClient {
  private readonly token: string;
  constructor(token: string) {
    this.token = token;
  }

  async queryDatabase(dbId: string, filter: unknown): Promise<unknown> {
    return this.queryRaw(dbId, { filter });
  }

  async queryDatabaseAll(
    dbId: string,
    filter?: unknown,
  ): Promise<Record<string, unknown>[]> {
    const pages: Record<string, unknown>[] = [];
    let cursor: string | undefined;

    do {
      const body: Record<string, unknown> = {};
      if (filter) body.filter = filter;
      if (cursor) body.start_cursor = cursor;

      const result = (await this.queryRaw(dbId, body)) as {
        results: Record<string, unknown>[];
        has_more: boolean;
        next_cursor: string | null;
      };

      pages.push(...result.results);
      cursor =
        result.has_more && result.next_cursor ? result.next_cursor : undefined;
    } while (cursor);

    return pages;
  }

  private async queryRaw(dbId: string, body: unknown): Promise<unknown> {
    const url = `${NOTION_BASE}/databases/${dbId}/query`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Notion-Version": NOTION_VERSION,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const text = await res.text();
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      throw new Error(`Notion response is not valid JSON (HTTP ${res.status})`);
    }

    if (!res.ok) {
      throw Object.assign(
        new Error(`Notion API error ${res.status}: ${text}`),
        {
          notionStatus: res.status,
        },
      );
    }

    return json;
  }
}
