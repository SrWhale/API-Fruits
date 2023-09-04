import Client from "../Client";

export default class Module {
    client: Client;

    name?: string;

    constructor(client: Client) {
        this.client = client;
    }
}