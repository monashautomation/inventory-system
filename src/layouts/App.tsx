import { useEffect, useState } from "react";
import { useParams, Link, Outlet } from "react-router-dom";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { AppSidebar } from "@/components/sidebar/app-sidebar";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";

interface Location {
  id: string;
  name: string;
  parentId: string | null;
}

// You can replace this with an actual API call
function fetchLocation(id: string): Promise<Location> {
  const mock: Record<string, Location> = {
    unit1: { id: "unit1", name: "Unit 1", parentId: "bay1" }, // Unit 1 is child of Bay 1
    bay1: { id: "bay1", name: "Bay 1", parentId: "shelf1" }, // Bay 1 is child of Shelf 1
    shelf1: { id: "shelf1", name: "Shelf 1", parentId: "systemsoffice" }, // Shelf 1 is child of Systems Office
    systemsoffice: {
      id: "systemsoffice",
      name: "Systems Office",
      parentId: null,
    },
  };
  const location = mock[id];
  if (!location) {
    return Promise.reject(new Error(`Location with id "${id}" not found`));
  }

  return Promise.resolve(location);
}

// Recursive loader
async function loadBreadcrumbTrail(id: string): Promise<Location[]> {
  const trail: Location[] = [];
  let currentId: string | null = id;

  while (currentId) {
    const loc = await fetchLocation(currentId);
    trail.unshift(loc); // Add to the start (root first)
    currentId = loc.parentId;
  }

  return trail;
}

export default function Layout() {
  const { locationId } = useParams();
  const [breadcrumbTrail, setBreadcrumbTrail] = useState<Location[] | null>(
    null,
  );
  useEffect(() => {
    if (locationId) {
      loadBreadcrumbTrail(locationId)
        .then(setBreadcrumbTrail)
        .catch((error) => {
          console.error("Failed to fetch location:", error);
        });
    } else {
      setBreadcrumbTrail(null);
    }
  }, [locationId]);

  return (
    <SidebarProvider>
      <AppSidebar />
      <main className="m-4 w-full">
        <div className="flex flex-row items-center gap-2">
          <SidebarTrigger />
          <Breadcrumb>
            <BreadcrumbList>
              {breadcrumbTrail?.map((loc, idx) => (
                <div key={loc.id} className="flex items-center">
                  <BreadcrumbSeparator />
                  <BreadcrumbItem>
                    {idx === breadcrumbTrail.length - 1 ? (
                      <BreadcrumbPage>{loc.name}</BreadcrumbPage>
                    ) : (
                      <BreadcrumbLink asChild>
                        <Link to={`/${loc.id}`}>{loc.name}</Link>
                      </BreadcrumbLink>
                    )}
                  </BreadcrumbItem>
                </div>
              ))}
            </BreadcrumbList>
          </Breadcrumb>
        </div>
        <Outlet />
      </main>
    </SidebarProvider>
  );
}
