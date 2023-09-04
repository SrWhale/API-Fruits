import { Request, Response } from "express";
import Route from "../../Structures/Route";

import Client from "../../Client";
import { WithId } from "mongodb";
import { User } from "../../Types";

export default class Login extends Route {
    name: string;

    constructor(client: Client) {
        super('/login', 'get', client);

        this.name = 'login';

        this.timeout = 1000;

        this.requiredAuth = true;
    }

    async execute(req: Request, res: Response, user: WithId<User>): Promise<Response> {
        const token = await this.client.API.generateToken(user.email, user.password);

        await this.client.db.collection('users').updateOne({ _id: user._id }, {
            $set: {
                token
            }
        })
        return res.status(200).send({
            authToken: token,
        }).end();
    }
}