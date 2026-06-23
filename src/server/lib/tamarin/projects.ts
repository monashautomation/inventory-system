import type { NotionClient } from "./notion";

const PROP_NAME = "Project Title";

export interface Project {
  id: string;
  name: string;
}

export async function getProjects(
  notion: NotionClient,
  dbId: string,
): Promise<Project[]> {
  const filter = {
    and: [
      { property: "Status", status: { does_not_equal: "On hold" } },
      { property: "Status", status: { does_not_equal: "Cancelled" } },
      { property: "Status", status: { does_not_equal: "Completed" } },
      { property: "Status", status: { does_not_equal: "DEAD" } },
    ],
  };

  const result = (await notion.queryDatabase(dbId, filter)) as Record<
    string,
    unknown
  >;
  const pages = (result.results as Record<string, unknown>[]) ?? [];

  return pages.map((page) => {
    const props = page.properties as Record<string, unknown>;
    return {
      id: (page.id as string) ?? "",
      name: extractTitle(props, PROP_NAME),
    };
  });
}

function extractTitle(props: Record<string, unknown>, key: string): string {
  const field = props[key] as Record<string, unknown> | undefined;
  const arr = field?.title as Record<string, unknown>[] | undefined;
  return (arr?.[0]?.plain_text as string) ?? "";
}
