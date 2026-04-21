import type { AppRouter } from "@/server/api/routers/_app";
import { updateItemInput } from "@/server/schema";
import { zodResolver } from "@hookform/resolvers/zod";
import type { inferProcedureOutput } from "@trpc/server";
import { useForm } from "react-hook-form";
import z from "zod";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { CascadingLocation } from "./CascadingLocation";
import { useCallback, useEffect, useState } from "react";
import { NumberInput } from "../inputs/numeric-input";
import { Button } from "@/components/ui/button";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "../ui/hover-card";
import { CircleQuestionMark, PlusIcon, X } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { trpc } from "@/client/trpc";
import { toast } from "sonner";
import { Badge } from "../ui/badge";

type GetItemOutput = inferProcedureOutput<AppRouter["item"]["get"]>;
interface GetTagOutput {
  id: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
  type: string;
  colour: string;
}

interface ModifyItemFormProps {
  item: GetItemOutput;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

interface Tag {
  name: string;
  type: string;
}

export default function ModifyItemForm({
  item,
  onOpenChange,
  onSuccess,
}: ModifyItemFormProps) {
  const [isStored, setIsStored] = useState(item?.stored);
  const [tags, setTags] = useState(item?.tags);
  const [newTag, setNewTag] = useState<Tag>({ name: "", type: "" });
  const mut = trpc.item.update.useMutation({
    onError: (error) => {
      toast.error(error.message || "An error occurred", {
        description: error.data?.code ?? "Unknown error",
      });
    },
    onSuccess: () => {
      toast.success("Item successfully modified!");
      onSuccess?.();
      onOpenChange(false);
    },
  });

  const form = useForm<z.infer<typeof updateItemInput>>({
    resolver: zodResolver(updateItemInput),
    defaultValues: {
      id: item?.id,
      serial: item?.serial,
      name: item?.name,
      tags: item?.tags.map((tag) => ({
        id: tag.id,
        name: tag.name,
        type: tag.type,
        colour: tag.colour,
      })),
      locationId: item?.locationId,
      stored: item?.stored,
      cost: item?.cost,
    },
  });

  const handleLocationSelect = useCallback(
    (locationId: string | null) => {
      if (locationId) {
        form.setValue("locationId", locationId || "", {
          shouldValidate: true,
          shouldDirty: true,
        });
      }
    },
    [form],
  );

  const handleAddTag = () => {
    if (!tags || !newTag.name.trim() || !newTag.type.trim()) return;

    const newFormattedTag = {
      id: "-1",
      name: newTag.name,
      type: newTag.type,
      colour: "#000000",
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const updatedTags = [...tags, newFormattedTag];
    setTags(updatedTags);
    setNewTag({ name: "", type: "" });
  };

  const onUpdateItemSubmit = (values: z.infer<typeof updateItemInput>) => {
    console.log(values);
    mut.mutate(values);
  };

  useEffect(() => {
    if (!tags) return;

    const formTags = tags.map((t) => ({
      id: t.id,
      name: t.name,
      type: t.type,
      colour: t.colour ?? "#000000",
    }));
    form.setValue("tags", formTags);
  }, [tags, form]);

  const handleRemoveTag = (tagToRemove: GetTagOutput) => {
    if (!tagToRemove) return;

    setTags((prevTags) => prevTags?.filter((t) => t.id !== tagToRemove.id));
  };

  if (!item) {
    // TODO: Changing loading form.
    return <div>Loading...</div>;
  }

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onUpdateItemSubmit)}
        className="h-full flex flex-col justify-between overflow-y-auto"
      >
        <div className="flex flex-col gap-6 px-6 flex-1 overflow-y-auto">
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Name</FormLabel>
                <FormControl>
                  <Input {...field} />
                </FormControl>
              </FormItem>
            )}
          />

          <HoverCard>
            <FormItem>
              <FormLabel>
                Serial
                <HoverCardTrigger asChild>
                  <sup>
                    <CircleQuestionMark size={14} />
                  </sup>
                </HoverCardTrigger>
                <HoverCardContent className="w-60">
                  <p className="text-sm">
                    For security reasons, you cannot modify the serial code
                  </p>
                </HoverCardContent>
              </FormLabel>
              <Input value={item?.serial} disabled={true} />
            </FormItem>
          </HoverCard>

          <FormField
            control={form.control}
            name="stored"
            render={({ field }) => (
              <FormItem>
                <FormLabel htmlFor="stored">Stored?</FormLabel>
                <Switch
                  id="stored"
                  checked={isStored}
                  onCheckedChange={(checked: boolean) => {
                    field.onChange(checked);
                    setIsStored(checked);
                  }}
                />
              </FormItem>
            )}
          />

          <div className="flex flex-col gap-2">
            {/* TODO: Show current location */}
            <FormLabel>Location</FormLabel>
            <CascadingLocation onLocationSelect={handleLocationSelect} />
          </div>

          <FormLabel>Tags</FormLabel>
          <div className="flex flex-wrap gap-2">
            {item &&
              tags?.map((tag) => (
                <Badge
                  key={item.id + tag.id}
                  style={{ "--color": tag.colour } as React.CSSProperties}
                  className="!bg-[#000000] text-white"
                >
                  {`${tag.name} ${tag.type}`}
                  <Button
                    variant="ghost"
                    type="button"
                    size="sm"
                    className="h-4 w-4 p-0 ml-1"
                    onClick={() => handleRemoveTag(tag)}
                  >
                    <X width={12} />
                  </Button>
                </Badge>
              ))}
          </div>

          <FormLabel>New Tag</FormLabel>

          {tags && (
            <div className="flex gap-3 items-end">
              <FormItem>
                <FormLabel>Name</FormLabel>
                <Input
                  value={newTag?.name}
                  onChange={(e) =>
                    setNewTag((prev) => ({ ...prev, name: e.target.value }))
                  }
                />
              </FormItem>

              <FormItem>
                <FormLabel>Type</FormLabel>
                <Input
                  value={newTag?.type}
                  onChange={(e) =>
                    setNewTag((prev) => ({ ...prev, type: e.target.value }))
                  }
                />
              </FormItem>

              <Button type="button" onClick={handleAddTag} variant="secondary">
                <PlusIcon />
              </Button>
            </div>
          )}

          <FormField
            control={form.control}
            name="cost"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Cost</FormLabel>
                <FormControl>
                  <NumberInput
                    min={1}
                    value={item?.cost}
                    onValueChange={field.onChange}
                    thousandSeparator=","
                    className=""
                  />
                </FormControl>
              </FormItem>
            )}
          />
        </div>

        <div className="w-full flex justify-end gap-3 p-6">
          <Button
            variant="ghost"
            type="button"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={mut.isPending}>
            {mut.isPending ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </form>
    </Form>
  );
}
