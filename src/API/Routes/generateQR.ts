import { Request, Response } from "express";
import Route from "../../Structures/Route";

import Client from "../../Client";
import { WithId } from "mongodb";
import { User } from "../../Types";

import querystring from "querystring";
import axios from "axios";

export default class GenerateQR extends Route {
    name: string;

    constructor(client: Client) {
        super('/generateqr', 'post', client);

        this.name = 'generateqr';

        this.timeout = 1000;

        this.requiredToken = true;
    }

    async execute(req: Request, res: Response, user: WithId<User>): Promise<Response> {

        const { amount, payer } = req.body as {
            amount: number,
            payer: {
                name: string,
                document: string,
            }
        }

        if (!amount || !payer || !payer.name || !payer.document) return res.status(400).send({
            status: false,
            message: 'Missing required parameters'
        }).end();

        if (typeof amount !== 'number') return res.status(400).send({
            status: false,
            message: 'Amount must be a number'
        }).end();

        const token = await this.client.modules.get('EzzBank').getToken();

        if (!token) return res.status(401).send({
            status: false,
            message: 'Error generating QR Code'
        }).end();

        return axios.post('https://api.ezzebank.com/v2/pix/qrcode', {
            amount,
            payer,
            external_id: user.email
        }, {
            headers: {
                Authorization: `Bearer ${token}`
            }
        }).then((resa) => {
            console.log(resa)

            return res.status(200).send({
                status: true,
                message: 'QR Code generated successfully'
            })
        }).catch(err => {
            console.log(err)

            return res.status(401).send({
                status: false,
                message: 'Error generating QR Code'
            })
        })
    }
}