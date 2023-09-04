import { Request, Response } from "express";
import Route from "../../Structures/Route";

import { ObjectId } from "mongodb";
import Client from "../../Client";

export default class CreateAccount extends Route {
    name: string;

    constructor(client: Client) {
        super('/createAccount', 'post', client);

        this.name = 'createAccount';

        this.timeout = 1000;
    }

    async execute(req: Request, res: Response): Promise<Response> {
        const timer = await this.createTimer(res);

        const { email, password, affiliate } = req.body as {
            email: string,
            password: string,
            affiliate: string
        };

        if (!email || !password) return res.status(400).send({
            status: false,
            message: 'Missing required parameters'
        }).end();

        const findEmail = await this.client.db.collection('users').findOne({ email: email.toLowerCase() });

        if (findEmail) return res.status(400).send({
            status: false,
            message: 'Email already exists'
        }).end();

        const token = await this.client.API.generateToken(email, password);

        await this.client.db.collection('users').insertOne({
            email: email.toLowerCase(),
            password: password,
            token,
            affiliation: [],
            affiliate: affiliate ? affiliate : null,
            balance: 0
        });

        if (affiliate) {
            const userAffiliate = await this.client.db.collection('users').findOne({ _id: new ObjectId(affiliate) });

            if (userAffiliate) {
                await this.client.db.collection('users').updateOne({ _id: new ObjectId(affiliate) }, {
                    $push: {
                        affiliation: email.toLowerCase()
                    }
                });
            }
        }

        this.clearTimer(timer);

        return res.status(200).send({
            authToken: token,
            expiresin: 60000 * 60 * 24
        });
    }
}