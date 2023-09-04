import express, { NextFunction, Request, Response } from "express";

import https from "https";

import http from "http";

import fs from "fs";

import { Collection } from "@discordjs/collection";

import { v4 as uuid } from "uuid";

import Client from "../Client";

import { User, RateLimit, RequestData } from "../Types";

import { WithId } from "mongodb";

import { Route, Module } from "../Structures/index";

import path from "path";

import jwt from "jsonwebtoken";

const app = express();

app.use(express.json());

export default class API extends Module {

    rateLimit: Collection<string, RateLimit>;

    routes: Collection<string, Route>

    constructor(client: Client) {
        super(client);

        this.client = client;

        this.name = 'api';

        this.rateLimit = new Collection();

        this.routes = new Collection();
    }

    async generateToken(email: string, password: string): Promise<string> {
        const token = jwt.sign({ email, password }, process.env.JWT_SECRET as string, { expiresIn: '1d' });

        return token;
    }

    async authToken(req: Request, res: Response): Promise<WithId<User> | undefined> {
        const authHeader = req.headers['authorization']
        const token = authHeader && authHeader.split(' ')[1]

        if (token == null) {
            res.status(401).send({
                status: false,
                error: "Token não encontrado"
            }).end();

            return undefined
        };

        return new Promise((resolve) => {
            jwt.verify(token, process.env.JWT_SECRET as string, async (err: any, user: any) => {
                if (err) {
                    res.status(403).send({
                        status: false,
                        error: "Token inválido"
                    }).end();

                    resolve(undefined)
                } else {
                    const User = await this.client.db.collection("users").findOne({ email: user.email }) as WithId<User>;

                    if (!User) {
                        res.status(403).send({
                            status: false,
                            error: "Token inválido"
                        }).end();

                        resolve(undefined)
                    };

                    resolve(User)
                }
            })
        })
    }

    async findAccount(email: string, password: string): Promise<WithId<User> | undefined> {
        if (!email || !password) return undefined;

        const findByEmail = await this.client.db.collection("users").findOne({ email: email.toLowerCase(), password }) as WithId<User>

        if (findByEmail) return findByEmail;

        return undefined;
    };

    async loadRoutes(path: string = '') {
        const routes = fs.readdirSync('dist/API/Routes' + path);

        for (const route of routes) {
            if (!route.endsWith('.js')) {
                this.loadRoutes(path + '/' + route);
                continue;
            } else {
                const Route = require(`./Routes${path}/${route}`).default;

                const routeInstance = new Route(this.client) as Route;

                this.routes.set(routeInstance.path, routeInstance)

                this.client.log(`Rota ${routeInstance.name} carregada.`, { tags: ['ROTAS'], color: 'magenta' });

                (app as any)[routeInstance.method](routeInstance.path, async (req: Request, res: Response, next: NextFunction) => {
                    try {
                        const { email, password } = req.body as {
                            email: string,
                            password: string
                        };

                        const token = req.headers['authorization']?.split(' ')[1];

                        const User = routeInstance.requiredToken ? await this.authToken(req, res) : await this.findAccount(email, password);

                        await routeInstance.execute(req, res, User as WithId<User> | undefined);
                    } catch (err) {
                        console.log(err);

                        res.status(500).send({
                            status: false,
                            error: (err as Error).message
                        }).end();
                    }
                })
            }
        }
    }

    async handleRequest(req: Request, res: Response, next: NextFunction): Promise<any> {
        const route = this.client.API.routes.get(req.path);

        if (!route) return res.status(404).send({
            status: false,
            error: "Rota não encontrada"
        }).end();

        if (route.method.toLowerCase() !== req.method.toLowerCase()) return res.status(405).send({
            status: false,
            error: "Método não permitido"
        }).end();

        if (route.requiredAuth) {
            const { email, password } = (req.query?.email ? req.query : req.body) as {
                email: string,
                password: string
            };

            if (!email || !password) return res.status(400).send({
                status: false,
                error: "Credenciais não encontradas"
            }).end();

            const find = await this.findAccount(email, password);

            if (!find) {
                this.checkRateLimit(req, res, () => {
                    res.status(401).send({
                        status: false,
                        error: "Credenciais inválidas"
                    }).end();
                }, true)
            } else {
                this.checkRateLimit(req, res, next, false)
            }
        } else if (route.requiredToken) {
            const auth = await this.authToken(req, res);

            if (auth) {
                req.body = {
                    ...auth,
                    ...req.body
                };
                this.checkRateLimit(req, res, next, false)
            }
        } else {
            this.checkRateLimit(req, res, next, true)
        }
    };

    async start(): Promise<void> {

        this.client.API = this;

        app.all('*', (req: Request, res: Response, next: NextFunction) => {
            this.handleRequest(req, res, next);
        });

        // const server = https.createServer({
        //     key: fs.readFileSync('/home/container/key.pem'),
        //     cert: fs.readFileSync('/home/container/cert.pem')
        // }, app);

        const server = http.createServer(app);

        const PORT = process.env.PORT

        server.listen(PORT, () => {
            this.client.log(`API iniciada na porta ${PORT}`, { tags: ['API'], color: 'green' });
        });

        this.loadRoutes();
    }

    checkRateLimit(req: Request, res: Response, next: NextFunction, useIP: boolean): Response | void {
        const IP = useIP ? req.headers['x-forwarded-for'] || req.socket.remoteAddress || null : ((req.query.email || req.body.email || '') as string).toLowerCase()

        const route = this.client.API.routes.get(req.path) as Route;

        if (!IP) return res.status(500).send({
            status: false,
            error: "IP não encontrado"
        });

        const rateLimit = this.rateLimit.get(IP as string) as RateLimit;

        if (!rateLimit) {
            const reqUuid = uuid();

            this.rateLimit.set(IP as string, {
                ip: IP as string,
                requests: new Collection<string, RequestData>().set(reqUuid, {
                    req,
                    uuid: reqUuid,
                    date: Date.now(),
                    timeout: setTimeout(() => {
                        this.rateLimit.get(IP as string)?.requests.delete(reqUuid);

                        const newLastRequest = this.rateLimit.get(IP as string)?.requests.first()

                        if (newLastRequest) {
                            (this.rateLimit.get(IP as string) as RateLimit).lastRequestDate = newLastRequest.date;
                        } else {
                            this.rateLimit.delete(IP as string)
                        }
                    }, 15000)
                }),
                lastRequestDate: Date.now()
            });
            return next()
        }

        if (rateLimit.endAt) {
            const date = new Date(rateLimit.endAt);

            return res.status(429).send({
                status: false,
                error: "Você foi bloqueado de acessar as rotas da API (RATE LIMIT)",
                endAt: `${date.getHours()}:${date.getMinutes()}:${date.getSeconds()} ${date.getDate()}/${date.getMonth() + 1}/${date.getFullYear()}`
            })
        };

        if (Date.now() - (rateLimit.lastRequestDate as number) < (useIP ? 4000 : route.timeout ? route.timeout : 3000)) {
            console.log("SETTING RATE LIMIT 1", rateLimit, route)
            const reqUuid = uuid();

            const pos = (this.rateLimit.get(IP as string) as RateLimit).requests.last() as RequestData

            if (pos && pos.uuid) ((this.rateLimit.get(IP as string) as RateLimit).requests.last() as RequestData).pos = reqUuid;

            this.rateLimit.get(IP as string)?.requests.set(reqUuid, {
                req,
                uuid: reqUuid,
                date: Date.now(),
                timeout: setTimeout(() => {
                    const findNow = this.rateLimit.get(IP as string)?.requests.find(e => e.uuid === reqUuid) as RequestData;

                    if (findNow && findNow.pos) {
                        const findPos = this.rateLimit.get(IP as string)?.requests.find(e => e.uuid === findNow.pos) as RequestData;

                        if (findPos) {
                            (this.rateLimit.get(IP as string) as RateLimit).lastRequestDate = findPos.date;
                        } else {
                            this.rateLimit.delete(IP as string)
                        }
                    }

                    this.rateLimit.get(IP as string)?.requests.delete(reqUuid);

                    delete (this.rateLimit.get(IP as string) as RateLimit)?.startAt
                    delete (this.rateLimit.get(IP as string) as RateLimit)?.endAt
                }, 5000)
            });

            (this.rateLimit.get(IP as string) as RateLimit).lastRequestDate = Date.now();

            (this.rateLimit.get(IP as string) as RateLimit).startAt = Date.now();
            (this.rateLimit.get(IP as string) as RateLimit).endAt = Date.now() + 5000;

            const date = new Date(Date.now() + 10000);

            return res.status(429).send({
                status: false,
                error: "Você foi bloqueado de acessar as rotas da API (RATE LIMIT)",
                endAt: `${date.getHours()}:${date.getMinutes()}:${date.getSeconds()} ${date.getDate()}/${date.getMonth() + 1}/${date.getFullYear()}`
            });
        }

        if (rateLimit.requests.size >= 100) {
            console.log("SETTING RATE LIMIT 2", rateLimit, route)
            const reqUuid = uuid();

            const pos = (this.rateLimit.get(IP as string) as RateLimit).requests.last() as RequestData

            if (pos && pos.uuid) ((this.rateLimit.get(IP as string) as RateLimit).requests.last() as RequestData).pos = reqUuid;

            this.rateLimit.get(IP as string)?.requests.set(reqUuid, {
                req,
                uuid: reqUuid,
                date: Date.now(),
                timeout: setTimeout(() => {

                    const findNow = this.rateLimit.get(IP as string)?.requests.find(e => e.uuid === reqUuid) as RequestData;

                    if (findNow && findNow.pos) {
                        const findPos = this.rateLimit.get(IP as string)?.requests.find(e => e.uuid === findNow.pos) as RequestData;

                        if (findPos) {
                            (this.rateLimit.get(IP as string) as RateLimit).lastRequestDate = findPos.date;
                        } else {
                            this.rateLimit.delete(IP as string)
                        }
                    }

                    this.rateLimit.get(IP as string)?.requests.delete(reqUuid)
                }, 20000)
            });

            (this.rateLimit.get(IP as string) as RateLimit).lastRequestDate = Date.now();

            (this.rateLimit.get(IP as string) as RateLimit).startAt = Date.now();
            (this.rateLimit.get(IP as string) as RateLimit).endAt = Date.now() + 30000;

            (this.rateLimit.get(IP as string) as RateLimit).timeout = setTimeout(() => {
                delete (this.rateLimit.get(IP as string) as RateLimit).startAt

                delete (this.rateLimit.get(IP as string) as RateLimit).endAt
            }, 30000)

            const date = new Date(Date.now() + 30000);

            return res.status(429).send({
                status: false,
                error: "Você foi bloqueado de acessar as rotas da API (RATE LIMIT)",
                endAt: `${date.getHours()}:${date.getMinutes()}:${date.getSeconds()} ${date.getDate()}/${date.getMonth() + 1}/${date.getFullYear()}`,
                duration: '30s'
            });
        } else {

            const reqUuid = uuid();

            const pos = (this.rateLimit.get(IP as string) as RateLimit).requests.last() as RequestData

            if (pos && pos.uuid) {
                console.log("EXSISTS POS");
                ((this.rateLimit.get(IP as string) as RateLimit).requests.last() as RequestData).pos = reqUuid;
            }

            this.rateLimit.get(IP as string)?.requests.set(reqUuid, {
                req,
                uuid: reqUuid,
                date: Date.now(),
                timeout: setTimeout(() => {
                    const findNow = this.rateLimit.get(IP as string)?.requests.find(e => e.uuid === reqUuid) as RequestData;

                    if (findNow && findNow.pos) {
                        const findPos = this.rateLimit.get(IP as string)?.requests.find(e => e.uuid === findNow.pos) as RequestData;

                        if (findPos && findPos.uuid) {
                            console.log(this.rateLimit.get(IP as string)?.requests.size);
                            (this.rateLimit.get(IP as string) as RateLimit).lastRequestDate = findPos.date;
                        } else {
                            console.log("SEM FUTURO KKKKK")
                            this.rateLimit.delete(IP as string)
                        }
                    }

                    this.rateLimit.get(IP as string)?.requests.delete(reqUuid)
                }, 20000),
            });

            (this.rateLimit.get(IP as string) as RateLimit).lastRequestDate = Date.now();
        }

        const ARRAY_INTERVAL = [];

        const requests = this.rateLimit.get(IP as string)?.requests.map(r => r.date) as number[];

        for (let i = 0; i < requests.length; i++) {
            const now = requests[i];

            const next = requests[i + 1];

            if (next) {
                if (next > now) ARRAY_INTERVAL.push(next - now);

                if (next < now) ARRAY_INTERVAL.push(now - next);
            }
        };

        const MEDIA = ARRAY_INTERVAL.reduce((a, b) => a + b, 0) / ARRAY_INTERVAL.length;

        if ((useIP || !route.timeout) && requests.length >= 5 && MEDIA < 5000) {
            console.log("SETTING RATE LIMIT 3", rateLimit, route);

            (this.rateLimit.get(IP as string) as RateLimit).lastRequestDate = Date.now();

            (this.rateLimit.get(IP as string) as RateLimit).startAt = Date.now();
            (this.rateLimit.get(IP as string) as RateLimit).endAt = Date.now() + 30000;

            (this.rateLimit.get(IP as string) as RateLimit).timeout = setTimeout(() => {
                delete (this.rateLimit.get(IP as string) as RateLimit).startAt

                delete (this.rateLimit.get(IP as string) as RateLimit).endAt
            }, 30000)

            const date = new Date(Date.now() + 30000);

            return res.status(429).send({
                status: false,
                error: "Você foi bloqueado de acessar as rotas da API (RATE LIMIT)",
                endAt: `${date.getHours()}:${date.getMinutes()}:${date.getSeconds()} ${date.getDate()}/${date.getMonth() + 1}/${date.getFullYear()}`,
                duration: '30s'
            });
        }

        next();
    }
}