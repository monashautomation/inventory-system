import type { AppRouter } from "@/server/api/routers/_app";
import type { inferProcedureOutput } from "@trpc/server";
import { useCallback, useMemo, useState } from "react";
import { LocationSelector } from "./LocationSelector";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbSeparator,
} from "../ui/breadcrumb";
import { FormLabel } from "../ui/form";

type GetSingleLocationOutput = inferProcedureOutput<
  AppRouter["location"]["get"]
>;

interface CascadingLocationSelectorProps {
  onLocationSelect?: (locationId: string | null) => void;
  initialPath?: GetSingleLocationOutput[];
}

export function CascadingLocation({
  onLocationSelect,
  initialPath = [],
}: CascadingLocationSelectorProps) {
  // Store the path (ie. location path)
  const [selectedPath, setSelectedPath] =
    useState<GetSingleLocationOutput[]>(initialPath);

  const handleLocationSelect = useCallback(
    (
      level: number,
      locationId: string,
      locationData: GetSingleLocationOutput | null,
    ) => {
      setSelectedPath((prev) => {
        let newPath: GetSingleLocationOutput[];

        if (locationId === "") {
          newPath = prev.slice(0, level);
        } else if (locationData) {
          newPath = [...prev.slice(0, level), locationData];
        } else {
          return prev;
        }

        const finalLocationId =
          newPath.length > 0 ? newPath[newPath.length - 1]?.id : null;

        if (!finalLocationId) return [];

        onLocationSelect?.(finalLocationId);
        return newPath;
      });
    },
    [onLocationSelect],
  );

  const levelsToShow = useMemo(() => {
    const levels = [0];

    for (let i = 0; i < selectedPath.length; i++) {
      levels.push(i + 1);
    }

    return levels;
  }, [selectedPath]);

  return (
    <>
      <div className="grid grid-cols-3 gap-3">
        {levelsToShow.map((level: number) => {
          const parentId =
            level === 0 ? null : (selectedPath[level - 1]?.id ?? null);
          const currentValue = selectedPath[level]?.id ?? "";

          return (
            <LocationSelector
              parentId={parentId}
              value={currentValue}
              onSelect={(locationId, locationData) =>
                handleLocationSelect(level, locationId, locationData)
              }
              key={level}
            />
          );
        })}
      </div>
      {selectedPath.length > 0 && (
        <>
          <FormLabel>Items will be saved to:</FormLabel>
          <Breadcrumb>
            <BreadcrumbList>
              {selectedPath.map((loc, i) => {
                return (
                  loc &&
                  (i === selectedPath.length - 1 ? (
                    <BreadcrumbItem key={loc.id}>{loc.name}</BreadcrumbItem>
                  ) : (
                    <>
                      <BreadcrumbItem>{loc.name}</BreadcrumbItem>
                      <BreadcrumbSeparator />
                    </>
                  ))
                );
              })}
            </BreadcrumbList>
          </Breadcrumb>
        </>
      )}
    </>
  );
}
