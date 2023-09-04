import { Request, Response } from "express";
import Route from "../../../Structures/Route";

import Client from "../../../Client";
import { WithId } from "mongodb";
import { User } from "../../../Types";

export default class CreateGame extends Route {
    name: string;

    constructor(client: Client) {
        super('/fruits/createGame', 'post', client);

        this.name = 'createGame';

        this.timeout = 1000;

        this.requiredToken = true;
    }

    async execute(req: Request, res: Response, user: WithId<User>): Promise<Response> {

        return res.status(200).send({
            status: true
        })
    }
}