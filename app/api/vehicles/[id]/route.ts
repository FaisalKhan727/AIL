import { item } from "@/lib/server/crud";
import { options } from "../options";

export const { GET, PATCH, DELETE } = item(options);
