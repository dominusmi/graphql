/*
 * Copyright (c) "Neo4j"
 * Neo4j Sweden AB [http://neo4j.com]
 *
 * This file is part of Neo4j.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import type { Driver } from "neo4j-driver";
import type { Response } from "supertest";
import supertest from "supertest";
import { Neo4jGraphQL } from "../../../src/classes";
import { generateUniqueType } from "../../utils/graphql-types";
import type { TestGraphQLServer } from "../setup/apollo-server";
import { ApolloTestServer } from "../setup/apollo-server";
import { TestSubscriptionsPlugin } from "../../utils/TestSubscriptionPlugin";
import { WebSocketTestClient } from "../setup/ws-client";
import Neo4j from "../setup/neo4j";

describe("Create Subscription with optional filters valid for all types", () => {
    let neo4j: Neo4j;
    let driver: Driver;

    const typeMovie = generateUniqueType("Movie");

    let server: TestGraphQLServer;
    let wsClient: WebSocketTestClient;

    beforeAll(async () => {
        const typeDefs = `
         type ${typeMovie} {
            id: ID
            title: String
            releasedIn: Int
            averageRating: Float
            fileSize: BigInt
            isFavorite: Boolean
            similarTitles: [String]
         }
         `;

        neo4j = new Neo4j();
        driver = await neo4j.getDriver();

        const neoSchema = new Neo4jGraphQL({
            typeDefs,
            driver,
            config: {
                driverConfig: {
                    database: neo4j.getIntegrationDatabaseName(),
                },
            },
            plugins: {
                subscriptions: new TestSubscriptionsPlugin(),
            },
        });

        server = new ApolloTestServer(neoSchema);
        await server.start();
    });

    beforeEach(() => {
        wsClient = new WebSocketTestClient(server.wsPath);
    });

    afterEach(async () => {
        await wsClient.close();
    });

    afterAll(async () => {
        await server.close();
        await driver.close();
    });

    test("create subscription", async () => {
        await wsClient.subscribe(`
                            subscription {
                                ${typeMovie.operations.subscribe.created} {
                                    ${typeMovie.operations.subscribe.payload.created} {
                                        title
                                    }
                                    event
                                    timestamp
                                }
                            }
                            `);

        await createMovie({ id: generateRandom(), title: "movie1" });
        await createMovie({ id: generateRandom(), title: "movie2" });

        expect(wsClient.errors).toEqual([]);
        expect(wsClient.events).toEqual([
            {
                [typeMovie.operations.subscribe.created]: {
                    [typeMovie.operations.subscribe.payload.created]: { title: "movie1" },
                    event: "CREATE",
                    timestamp: expect.any(Number),
                },
            },
            {
                [typeMovie.operations.subscribe.created]: {
                    [typeMovie.operations.subscribe.payload.created]: { title: "movie2" },
                    event: "CREATE",
                    timestamp: expect.any(Number),
                },
            },
        ]);
    });
    test("create subscription with where", async () => {
        await wsClient.subscribe(`
            subscription {
                ${typeMovie.operations.subscribe.created}(where: { title: "movie1" }) {
                    ${typeMovie.operations.subscribe.payload.created} {
                        title
                    }
                }
            }
        `);

        await createMovie({ id: generateRandom(), title: "movie1" });
        await createMovie({ id: generateRandom(), title: "movie2" });

        expect(wsClient.errors).toEqual([]);
        expect(wsClient.events).toEqual([
            {
                [typeMovie.operations.subscribe.created]: {
                    [typeMovie.operations.subscribe.payload.created]: { title: "movie1" },
                },
            },
        ]);
    });

    test("subscription with where filter _NOT 1 result", async () => {
        await wsClient.subscribe(`
            subscription {
                ${typeMovie.operations.subscribe.created}(where: { title_NOT: "movie1" }) {
                    ${typeMovie.operations.subscribe.payload.created} {
                        title
                    }
                }
            }
        `);

        await createMovie({ id: generateRandom(), title: "movie1" });
        await createMovie({ id: generateRandom(), title: "movie2" });

        expect(wsClient.errors).toEqual([]);
        expect(wsClient.events).toEqual([
            {
                [typeMovie.operations.subscribe.created]: {
                    [typeMovie.operations.subscribe.payload.created]: { title: "movie2" },
                },
            },
        ]);
    });
    test("subscription with where filter _NOT multiple results", async () => {
        await wsClient.subscribe(`
            subscription {
                ${typeMovie.operations.subscribe.created}(where: { title_NOT: "movie0" }) {
                    ${typeMovie.operations.subscribe.payload.created} {
                        title
                    }
                }
            }
        `);

        await createMovie({ id: generateRandom(), title: "movie1" });
        await createMovie({ id: generateRandom(), title: "movie2" });

        expect(wsClient.errors).toEqual([]);
        expect(wsClient.events).toIncludeSameMembers([
            {
                [typeMovie.operations.subscribe.created]: {
                    [typeMovie.operations.subscribe.payload.created]: { title: "movie1" },
                },
            },
            {
                [typeMovie.operations.subscribe.created]: {
                    [typeMovie.operations.subscribe.payload.created]: { title: "movie2" },
                },
            },
        ]);
    });
    test("subscription with where filter _NOT empty result", async () => {
        await wsClient.subscribe(`
            subscription {
                ${typeMovie.operations.subscribe.created}(where: { title_NOT: "movie1" }) {
                    ${typeMovie.operations.subscribe.payload.created} {
                        title
                    }
                }
            }
        `);

        await createMovie({ id: generateRandom(), title: "movie1" });

        expect(wsClient.errors).toEqual([]);
        expect(wsClient.events).toEqual([]);
    });

    // all but boolean types
    test("subscription with IN on String", async () => {
        await wsClient.subscribe(`
            subscription {
                ${typeMovie.operations.subscribe.created}(where: { title_IN: ["movie", "movie1"] }) {
                    ${typeMovie.operations.subscribe.payload.created} {
                        title
                    }
                }
            }
        `);

        await createMovie({ id: generateRandom(), title: "movie1" });
        await createMovie({ id: generateRandom(), title: "movie2" });

        expect(wsClient.errors).toEqual([]);
        expect(wsClient.events).toEqual([
            {
                [typeMovie.operations.subscribe.created]: {
                    [typeMovie.operations.subscribe.payload.created]: { title: "movie1" },
                },
            },
        ]);
    });
    test("subscription with NOT_IN on String", async () => {
        await wsClient.subscribe(`
            subscription {
                ${typeMovie.operations.subscribe.created}(where: { title_NOT_IN: ["movie", "movie1"] }) {
                    ${typeMovie.operations.subscribe.payload.created} {
                        title
                    }
                }
            }
        `);

        await createMovie({ id: generateRandom(), title: "movie1" });
        await createMovie({ id: generateRandom(), title: "movie2" });

        expect(wsClient.errors).toEqual([]);
        expect(wsClient.events).toEqual([
            {
                [typeMovie.operations.subscribe.created]: {
                    [typeMovie.operations.subscribe.payload.created]: { title: "movie2" },
                },
            },
        ]);
    });
    test("subscription with IN on ID as String", async () => {
        await wsClient.subscribe(`
            subscription {
                ${typeMovie.operations.subscribe.created}(where: { id_IN: ["1", "12"] }) {
                    ${typeMovie.operations.subscribe.payload.created} {
                        title
                    }
                }
            }
        `);

        await createMovie({ id: "1", title: "movie1" });
        await createMovie({ id: "12", title: "movie2" });

        expect(wsClient.errors).toEqual([]);
        expect(wsClient.events).toEqual([
            {
                [typeMovie.operations.subscribe.created]: {
                    [typeMovie.operations.subscribe.payload.created]: { title: "movie1" },
                },
            },
            {
                [typeMovie.operations.subscribe.created]: {
                    [typeMovie.operations.subscribe.payload.created]: { title: "movie2" },
                },
            },
        ]);
    });
    test("subscription with IN on ID as int", async () => {
        await wsClient.subscribe(`
            subscription {
                ${typeMovie.operations.subscribe.created}(where: { id_IN: [42, 4, 2] }) {
                    ${typeMovie.operations.subscribe.payload.created} {
                        title
                    }
                }
            }
        `);

        await createMovie({ id: 42, title: "movie1" });
        await createMovie({ id: 2, title: "movie2" });

        expect(wsClient.errors).toEqual([]);
        expect(wsClient.events).toEqual([
            {
                [typeMovie.operations.subscribe.created]: {
                    [typeMovie.operations.subscribe.payload.created]: { title: "movie1" },
                },
            },
            {
                [typeMovie.operations.subscribe.created]: {
                    [typeMovie.operations.subscribe.payload.created]: { title: "movie2" },
                },
            },
        ]);
    });
    test("subscription with IN on Int", async () => {
        await wsClient.subscribe(`
            subscription {
                ${typeMovie.operations.subscribe.created}(where: { releasedIn_IN: [2019, 2020] }) {
                    ${typeMovie.operations.subscribe.payload.created} {
                        title
                    }
                }
            }
        `);

        await createMovie({ id: generateRandom(), title: "movie1", releasedIn: 2019 });
        await createMovie({ id: generateRandom(), title: "movie2", releasedIn: 2000 });

        expect(wsClient.errors).toEqual([]);
        expect(wsClient.events).toEqual([
            {
                [typeMovie.operations.subscribe.created]: {
                    [typeMovie.operations.subscribe.payload.created]: { title: "movie1" },
                },
            },
        ]);
    });
    test("subscription with NOT_IN on Int", async () => {
        await wsClient.subscribe(`
            subscription {
                ${typeMovie.operations.subscribe.created}(where: { releasedIn_NOT_IN: [2019, 2020] }) {
                    ${typeMovie.operations.subscribe.payload.created} {
                        title
                    }
                }
            }
        `);

        await createMovie({ id: generateRandom(), title: "movie1", releasedIn: 2019 });
        await createMovie({ id: generateRandom(), title: "movie2", releasedIn: 2000 });

        expect(wsClient.errors).toEqual([]);
        expect(wsClient.events).toEqual([
            {
                [typeMovie.operations.subscribe.created]: {
                    [typeMovie.operations.subscribe.payload.created]: { title: "movie2" },
                },
            },
        ]);
    });
    test("subscription with IN on Float", async () => {
        await wsClient.subscribe(`
            subscription {
                ${typeMovie.operations.subscribe.created}(where: { averageRating_IN: [5.9, 7] }) {
                    ${typeMovie.operations.subscribe.payload.created} {
                        title
                    }
                }
            }
        `);

        await createMovie({ id: generateRandom(), title: "movie1", averageRating: 5.9 });
        await createMovie({ id: generateRandom(), title: "movie2", averageRating: 7.1 });

        expect(wsClient.errors).toEqual([]);
        expect(wsClient.events).toEqual([
            {
                [typeMovie.operations.subscribe.created]: {
                    [typeMovie.operations.subscribe.payload.created]: { title: "movie1" },
                },
            },
        ]);
    });
    test("subscription with NOT_IN on Float", async () => {
        await wsClient.subscribe(`
            subscription {
                ${typeMovie.operations.subscribe.created}(where: { averageRating_NOT_IN: [5.9, 7] }) {
                    ${typeMovie.operations.subscribe.payload.created} {
                        title
                    }
                }
            }
        `);

        await createMovie({ id: generateRandom(), title: "movie1", averageRating: 5.9 });
        await createMovie({ id: generateRandom(), title: "movie2", averageRating: 7 });

        expect(wsClient.errors).toEqual([]);
        expect(wsClient.events).toEqual([]);
    });
    test("subscription with IN on BigInt", async () => {
        await wsClient.subscribe(`
            subscription {
                ${typeMovie.operations.subscribe.created}(where: { fileSize_IN: [9223372036854775608, 9223372036854775508] }) {
                    ${typeMovie.operations.subscribe.payload.created} {
                        title
                    }
                }
            }
        `);

        await createMovie({ id: generateRandom(), title: "movie1", fileSize: "9223372036854775508" });
        await createMovie({ id: generateRandom(), title: "movie2", fileSize: "1234" });

        expect(wsClient.errors).toEqual([]);
        expect(wsClient.events).toEqual([
            {
                [typeMovie.operations.subscribe.created]: {
                    [typeMovie.operations.subscribe.payload.created]: { title: "movie1" },
                },
            },
        ]);
    });
    test("subscription with NOT_IN on BigInt", async () => {
        await wsClient.subscribe(`
            subscription {
                ${typeMovie.operations.subscribe.created}(where: { fileSize_NOT_IN: [9223372036854775608, 9223372036854775508] }) {
                    ${typeMovie.operations.subscribe.payload.created} {
                        title
                    }
                }
            }
        `);

        await createMovie({ id: generateRandom(), title: "movie1", fileSize: "9223372036854775508" });
        await createMovie({ id: generateRandom(), title: "movie2", fileSize: "1234" });

        expect(wsClient.errors).toEqual([]);
        expect(wsClient.events).toEqual([
            {
                [typeMovie.operations.subscribe.created]: {
                    [typeMovie.operations.subscribe.payload.created]: { title: "movie2" },
                },
            },
        ]);
    });

    test("subscription with IN on Boolean should not work", async () => {
        await wsClient.subscribe(`
            subscription {
                ${typeMovie.operations.subscribe.deleted}(where: { isFavorite_IN: [true] }) {
                    ${typeMovie.operations.subscribe.payload.deleted} {
                        title
                    }
                }
            }
        `);

        await createMovie({ id: generateRandom(), title: "some_movie_wrong1", isFavorite: true });
        await createMovie({ id: generateRandom(), title: "some_movie_wrong2", isFavorite: true });

        expect(wsClient.errors).toEqual([]);
        expect(wsClient.events).toEqual([]);
    });
    test("subscription with NOT_IN on Boolean should not work", async () => {
        await wsClient.subscribe(`
            subscription {
                ${typeMovie.operations.subscribe.deleted}(where: { isFavorite_NOT_IN: [true] }) {
                    ${typeMovie.operations.subscribe.payload.deleted} {
                        title
                    }
                }
            }
        `);

        await createMovie({ id: generateRandom(), title: "some_movie_wrong3", isFavorite: true });
        await createMovie({ id: generateRandom(), title: "some_movie_wrong4", isFavorite: true });

        expect(wsClient.errors).toEqual([]);
        expect(wsClient.events).toEqual([]);
    });
    test("subscription with IN on Array should not work", async () => {
        await wsClient.subscribe(`
            subscription {
                ${typeMovie.operations.subscribe.deleted}(where: { similarTitles_IN: ["fight club"] }) {
                    ${typeMovie.operations.subscribe.payload.deleted} {
                        title
                    }
                }
            }
        `);

        await createMovie({ id: generateRandom(), title: "some_movie_wrong5", similarTitles: ["fight club"] });
        await createMovie({ id: generateRandom(), title: "some_movie_wrong6" });

        expect(wsClient.errors).toEqual([]);
        expect(wsClient.events).toEqual([]);
    });
    test("subscription with NOT_IN on Array should not work", async () => {
        await wsClient.subscribe(`
            subscription {
                ${typeMovie.operations.subscribe.deleted}(where: { similarTitles_NOT_IN: ["blue"] }) {
                    ${typeMovie.operations.subscribe.payload.deleted} {
                        title
                    }
                }
            }
        `);

        await createMovie({ id: generateRandom(), title: "some_movie_wrong7", similarTitles: ["blue bus"] });
        await createMovie({ id: generateRandom(), title: "some_movie_wrong8" });

        expect(wsClient.errors).toEqual([]);
        expect(wsClient.events).toEqual([]);
    });

    const generateRandom = () => Math.floor(Math.random() * 100) + 1;
    const makeTypedFieldValue = (value) => (typeof value === "string" ? `"${value}"` : value);
    async function createMovie({
        id,
        title,
        releasedIn = 2022,
        averageRating = 9.5,
        fileSize = "2147483647",
        isFavorite = false,
        similarTitles = ["the matrix"],
    }): Promise<Response> {
        const result = await supertest(server.path)
            .post("")
            .send({
                query: `
                    mutation {
                        ${typeMovie.operations.create}(input: [{ id: ${makeTypedFieldValue(
                    id
                )}, title: "${title}", releasedIn: ${releasedIn}, averageRating: ${averageRating}, fileSize: "${fileSize}", isFavorite: ${isFavorite}, similarTitles: [${similarTitles.map(
                    makeTypedFieldValue
                )}] }]) {
                            ${typeMovie.plural} {
                                id
                                title
                                releasedIn
                                averageRating
                                fileSize
                                isFavorite
                                similarTitles
                            }
                        }
                    }
                `,
            })
            .expect(200);
        return result;
    }
});
