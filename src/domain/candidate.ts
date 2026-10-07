import { z } from "zod";

export const QuantSignalSchema = z.object({
  metric: z.string().min(1),
  value: z.union([z.number(), z.string()]),
  period: z.string().min(1),
  industryPercentile: z.number().min(0).max(100).optional(),
});

export const CandidatePacketSchema = z.object({
  candidateId: z.string().min(1),
  ticker: z.string().min(1),
  companyName: z.string().min(1),
  market: z.enum(["TWSE", "TPEX"]),
  industry: z.string().min(1),
  asOf: z.string().min(1),
  quantScore: z.number(),
  quantSignals: z.array(QuantSignalSchema),
  hardConstraintsPassed: z.boolean(),
  dataSources: z
    .array(
      z.object({
        source: z.string().min(1),
        asOf: z.string().min(1),
      }),
    )
    .optional(),
});

export type QuantSignal = z.infer<typeof QuantSignalSchema>;
export type CandidatePacket = z.infer<typeof CandidatePacketSchema>;
