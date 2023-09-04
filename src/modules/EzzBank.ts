
import Client from "../Client";
import { Module } from "../Structures/index";

import axios from "axios";

import querystring from "querystring";

export default class EzzBank extends Module {
    API_URL: string

    constructor(client: Client) {
        super(client)

        this.name = 'EzzBank';

        this.API_URL = 'https://api.ezzebank.com/v2/oauth/token'
    }

    async start(): Promise<void> {
        return
    }

    async getToken(): Promise<string> {
        const { CLIENT_ID, CLIENT_SECRET } = process.env;

        const merge = `${CLIENT_ID}:${CLIENT_SECRET}`;

        const base64 = Buffer.from(merge).toString('base64');

        return axios.post(this.API_URL, {
            'grant_type': 'client_credentials'
        }, {
            headers: {
                Authorization: `Basic ${base64}`,
                'Content-Type': 'application/x-www-form-urlencoded'
            },

        }).then(data => {
            return data.data.access_token
        }).catch(err => {
            return null
        });
    }
}