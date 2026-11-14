import { collection } from "@/lib/server/crud";
import { options } from "./options";

export const { GET, POST } = collection(options);
