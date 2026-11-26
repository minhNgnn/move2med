import { z } from "zod";
import { handle, requirePatient } from "@/lib/api";
import { handleAssistant, MAX_TEXT } from "@/lib/assistant/service";

/** The voice assistant: one endpoint for sentences, quick buttons and read-back answers. Patient session only. */
export const POST = handle(async (req) => {
  const ps = await requirePatient();
  const b = z
    .object({
      lang: z.enum(["en", "de"]).default("en"),
      text: z.string().max(MAX_TEXT * 4).optional(), // the service answers "too long" itself; this only stops huge bodies
      button: z.enum(["next", "driver", "cancel_next"]).optional(),
      answer: z.enum(["yes", "no"]).optional(),
      token: z.string().max(1500).optional(),
      pick: z.string().max(1500).optional(),
    })
    .parse(await req.json());
  return handleAssistant({ rxId: ps.rx, ...b });
});
