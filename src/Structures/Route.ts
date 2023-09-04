import { NextFunction, Request, Response } from "express";

import Client from "../Client";

import { WithId } from "mongodb";

import { User } from "../Types";

export default abstract class Route {
    path: string;
    method: string;
    client: Client;

    abstract name: string;

    requiredAuth?: boolean;

    timeout?: number;

    requiredToken?: boolean;

    constructor(path: string, method: string, client: Client) {
        this.path = path;
        this.method = method;

        this.client = client;
    }

    abstract execute(req: Request, res: Response, User?: WithId<User>): Promise<Response>;

    async createTimer(res: Response): Promise<NodeJS.Timeout> {

        let ended = false;

        const timeout = setTimeout(() => {
            ended = true;

            res.status(500).send({
                status: false,
                message: 'Internal Server Error'
            }).end();
        }, this.client.REQUEST_TIMEOUT_MS);

        res.on('finish', () => {
            if (!ended) clearTimeout(timeout);
        });

        return timeout;
    };

    clearTimer(timer: NodeJS.Timeout): void {
        clearTimeout(timer);
    }
}