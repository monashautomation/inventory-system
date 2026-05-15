import { z } from "zod";

export const prusaStatusResponseSchema = z.object({
  storage: z
    .object({
      name: z.string().optional(),
      read_only: z.boolean().optional(),
    })
    .optional(),
  printer: z
    .object({
      state: z.string().optional(),
      temp_nozzle: z.number().optional(),
      target_nozzle: z.number().optional(),
      temp_bed: z.number().optional(),
      target_bed: z.number().optional(),
    })
    .optional(),
  job: z
    .object({
      id: z.number().optional(),
      progress: z.number().optional(),
      time_remaining: z.number().optional(),
      time_printing: z.number().optional(),
    })
    .optional(),
});

export const prusaJobResponseSchema = z.object({
  id: z.number().optional(),
  state: z.string().optional(),
  progress: z.number().optional(),
  time_remaining: z.number().optional(),
  time_printing: z.number().optional(),
  file: z
    .object({
      name: z.string().optional(),
      display_name: z.string().optional(),
      meta: z
        .object({
          filament_type: z.string().optional(),
          material: z.string().optional(),
        })
        .optional(),
    })
    .optional(),
});

export type PrusaStatusResponse = z.infer<typeof prusaStatusResponseSchema>;
export type PrusaJobResponse = z.infer<typeof prusaJobResponseSchema>;
