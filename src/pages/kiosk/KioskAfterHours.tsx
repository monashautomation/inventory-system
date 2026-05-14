import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useKiosk } from "@/contexts/kiosk-context";
import { trpc } from "@/client/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { ArrowLeft, Loader2, Clock } from "lucide-react";
import { useForm, Controller } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";

const schema = z
  .object({
    duration: z.string().min(1, "Select a duration"),
    reason: z.string().min(1, "Select a reason"),
    customReason: z.string().optional(),
    supervisorId: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.reason === "Other" && !data.customReason?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Please describe what you're working on",
        path: ["customReason"],
      });
    }
  });

type FormValues = z.infer<typeof schema>;

export default function KioskAfterHours() {
  const { session } = useKiosk();
  const navigate = useNavigate();

  useEffect(() => {
    if (!session) void navigate("/kiosk", { replace: true });
  }, [session, navigate]);

  const { data: options } = trpc.kiosk.getAfterHoursOptions.useQuery();
  const { data: supervisors } = trpc.kiosk.getSupervisors.useQuery();

  const log = trpc.kiosk.logAfterHours.useMutation({
    onSuccess: () => {
      toast.success("After hours access logged successfully");
      void navigate("/kiosk/home");
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  const {
    control,
    handleSubmit,
    watch,
    register,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      duration: "",
      reason: "",
      customReason: "",
      supervisorId: "__none__",
    },
  });

  const watchedReason = watch("reason");

  const onSubmit = (values: FormValues) => {
    if (!session) return;
    log.mutate({
      studentId: session.student.studentId,
      duration: values.duration as Parameters<typeof log.mutate>[0]["duration"],
      reason: values.reason as Parameters<typeof log.mutate>[0]["reason"],
      customReason: values.reason === "Other" ? values.customReason : undefined,
      supervisorId:
        values.supervisorId && values.supervisorId !== "__none__"
          ? values.supervisorId
          : undefined,
    });
  };

  if (!session) return null;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="border-b px-8 py-4 flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate("/kiosk/home")}
        >
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div className="flex items-center gap-2">
          <Clock className="w-5 h-5 text-primary" />
          <h1 className="text-lg font-semibold">Log After Hours Access</h1>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center p-8">
        <form
          onSubmit={handleSubmit(onSubmit)}
          className="w-full max-w-md space-y-6"
        >
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">
              Logging as{" "}
              <span className="font-medium text-foreground">
                {session.student.name}
              </span>
            </p>
          </div>

          <div className="space-y-2">
            <Label>How long are you staying?</Label>
            <Controller
              control={control}
              name="duration"
              render={({ field }) => (
                <Select onValueChange={field.onChange} value={field.value}>
                  <SelectTrigger className="h-12">
                    <SelectValue placeholder="Select duration" />
                  </SelectTrigger>
                  <SelectContent>
                    {options?.durations.map((d) => (
                      <SelectItem key={d} value={d}>
                        {d}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {errors.duration && (
              <p className="text-sm text-destructive">
                {errors.duration.message}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label>What are you working on?</Label>
            <Controller
              control={control}
              name="reason"
              render={({ field }) => (
                <Select onValueChange={field.onChange} value={field.value}>
                  <SelectTrigger className="h-12">
                    <SelectValue placeholder="Select reason" />
                  </SelectTrigger>
                  <SelectContent>
                    {options?.reasons.map((r) => (
                      <SelectItem key={r} value={r}>
                        {r}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {errors.reason && (
              <p className="text-sm text-destructive">
                {errors.reason.message}
              </p>
            )}
          </div>

          {watchedReason === "Other" && (
            <div className="space-y-2">
              <Label>Describe what you're working on</Label>
              <Input
                {...register("customReason")}
                placeholder="e.g. Inventory Project"
                className="h-12"
                autoFocus
              />
              {errors.customReason && (
                <p className="text-sm text-destructive">
                  {errors.customReason.message}
                </p>
              )}
            </div>
          )}

          <div className="space-y-2">
            <Label>
              Supervisor{" "}
              <span className="text-muted-foreground font-normal">
                (optional)
              </span>
            </Label>
            <Controller
              control={control}
              name="supervisorId"
              render={({ field }) => (
                <Select
                  onValueChange={field.onChange}
                  value={field.value ?? "__none__"}
                >
                  <SelectTrigger className="h-12">
                    <SelectValue placeholder="None" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">None</SelectItem>
                    {supervisors?.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>

          <Button
            type="submit"
            className="w-full h-12 text-base"
            disabled={log.isPending}
          >
            {log.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Logging...
              </>
            ) : (
              "Log After Hours Access"
            )}
          </Button>
        </form>
      </div>
    </div>
  );
}
