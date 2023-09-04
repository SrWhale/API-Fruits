import { Collection } from "@discordjs/collection";
import { Request } from "express";

import RequestData from "./RequestData";

export default interface RateLimit {
    ip: string;
    requests: Collection<string, RequestData>
    startAt?: number
    endAt?: number;
    lastRequestDate?: number
    timeout?: NodeJS.Timeout;
    pos?: string
}