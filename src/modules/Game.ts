
import { Collection } from "@discordjs/collection";
import Client from "../Client";
import { GameData, Module } from "../Structures/index";

export default class Game extends Module {
    games: Collection<string, GameData>

    constructor(client: Client) {
        super(client)

        this.name = 'Game';

        this.games = new Collection()
    }

    async start(): Promise<void> {

    }
}