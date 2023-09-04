import { Request, Response } from "express";
import Route from "../../Structures/Route";

import Client from "../../Client";

export default class Deposit extends Route {
    name: string;

    constructor(client: Client) {
        super('/admin/ezzbank/deposit', 'post', client);

        this.name = 'deposit';

        this.timeout = 1000;
    }

    async execute(req: Request, res: Response): Promise<Response> {
        const { requestBody: { transactionType, external_id, amount, statusCode: { description } } } = req.body as {
            requestBody: {
                transactionType: string,
                external_id: string,
                amount: string,
                statusCode: {
                    description: string
                }
            }
        };

        if (transactionType !== 'PAYMENT') return res.status(200).send({
            message: "NOT PAYMENT"
        }).end();

        if (description !== 'Confirmed') return res.status(200).send({
            message: "NOT CONFIRMED"
        }).end();

        console.log(req.body)

        await this.client.db.collection('users').updateOne({ email: external_id }, {
            $inc: {
                balance: Number(amount)
            }
        });

        return res.status(200).end();
    }
}