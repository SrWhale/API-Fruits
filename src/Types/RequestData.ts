import { Request } from "express";

export default interface RequestData {
    req: Request;
    uuid: string;
    date: number;
    timeout: NodeJS.Timeout;
    pos?: string
}