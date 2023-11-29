import { Sequelize, DataTypes } from "sequelize";
import { pipeline } from "@xenova/transformers";
import { Pinecone } from "@pinecone-database/pinecone";
import { SearchResult } from "./classes.js";
import { TextEncoder } from "util";
import crypto from "crypto";
import TaskQueue from "@goodware/task-queue";
import fs from "fs";
import dotenv from "dotenv";
dotenv.config();

let queue = null;
let pinecone = null;
let index = null;
let extractor = null;
let sequelize = null;
let chunk = null;
let webpage = null;

let initDone = false;

async function hash(string) {
  const utf8 = new TextEncoder().encode(string);
  const hashBuffer = await crypto.subtle.digest("SHA-256", utf8);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map((bytes) => bytes.toString(16).padStart(2, "0")).join("");
  return hashHex;
}

async function tryFunc(func, tries, retryMsg, finalMsg) {
  let triesLeft = tries;
  while (1) {
    triesLeft--;

    if (triesLeft < 0) {
      console.log(finalMsg);
      return;
    }
    try {
      return await func();
    } catch (e) {
      console.log(`${retryMsg} :\nError {${e}}`);
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
}

async function extractEmbeddings(chunk) {
  let tries = 0;
  while (1) {
    tries++;

    if (tries > 10) {
      console.log(`Error while extracting embeddings for chunk: ${chunk}`);
      return;
    }
    try {
      const embeddings = await extractor(chunk, { pooling: "mean", normalize: true });
      return embeddings.tolist();
    } catch (e) {
      console.log(`Error while extracting embeddings for chunk: ${chunk} Retrying... :`);
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
}

async function urlExists(url) {
  const websiteExists = await chunk.findOne({
    where: {
      url: url,
    },
  });
  return Boolean(websiteExists);
}

const maxChunksInsert = process.env.MAX_CHUNKS_INSERT || 30;

async function init() {
  queue = new TaskQueue({ size: 50, workers: 10 });
  console.log("Setting up pinecone");
  pinecone = new Pinecone({
    apiKey: process.env.PINECONE_API_KEY,
    environment: process.env.PINECONE_ENVIRONMENT,
  });

  const indexName = process.env.PINECONE_INDEX_NAME || "website";
  console.log(`Checking if index ${indexName} exists...`);
  let indexes = await pinecone.listIndexes();
  indexes = indexes.map((i) => i.name);
  console.log(`Indexes: ${indexes}`);

  if (!indexes.includes(indexName)) {
    await pinecone.createIndex({
      name: indexName,
      dimension: process.env.PINECONE_DIMENSION || 384,
      metric: process.env.PINECONE_METRIC || "cosine",
      waitUntilReady: true,
    });
  }

  index = pinecone.index("website");

  const modelName = process.env.EMBEDDING_MODEL_NAME || "Xenova/all-MiniLM-L6-v2";
  console.log(`Loading pipeline for ${modelName}...`);
  extractor = await pipeline("feature-extraction", modelName);
  console.log(`Pipeline loaded for ${modelName}`);

  const logStream = fs.createWriteStream("./sql.log", { flags: "a" });
  const databaseName = process.env.DATABASE_NAME || "sifat";
  const databaseUser = process.env.DATABASE_USER || "root";
  const databasePassword = process.env.DATABASE_PASSWORD || "";
  const databaseHost = process.env.DATABASE_HOST || "localhost";
  const databasePort = process.env.DATABASE_PORT || 3306;
  const databaseDialect = process.env.DATABASE_DIALECT || "mysql";

  console.log(`Setting up database connection for ${databaseDialect}...`);
  sequelize = new Sequelize(databaseName, databaseUser, databasePassword, {
    dialect: databaseDialect,
    host: databaseHost,
    port: databasePort,
    logging: (msg) => logStream.write(msg + "\n=======================LOG END==========================\n"),
  });

  try {
    await sequelize.authenticate();
    console.log("Database connection has been established successfully.");
  } catch (error) {
    console.error("Unable to connect to the database:", error);
  }

  chunk = sequelize.define("chunks", {
    id: {
      type: DataTypes.STRING,
      primaryKey: true,
    },
    pid: DataTypes.STRING,
    url: DataTypes.STRING,
    chunk: DataTypes.TEXT,
  });

  webpage = sequelize.define("webpages", {
    hash: {
      type: DataTypes.STRING,
      primaryKey: true,
    },
    title: DataTypes.STRING,
    url: {
      type: DataTypes.STRING,
      unique: true,
    },
    summary: DataTypes.TEXT,
    sitename: DataTypes.STRING,
  });

  await sequelize.sync();
}

async function allUrls() {
  if (!initDone) {
    await init();
    initDone = true;
  }

  const websites = await webpage.findAll({
    attributes: ["url"],
  });
  return websites.map((w) => w.url);
}

async function saveChunk(title, summary, sitename, url, chunks) {
  if (chunks.length == 0) {
    return;
  }

  if (!initDone) {
    await init();
    initDone = true;
  }

  const task = async () => {
    const websiteExists = await webpage.findOne({
      where: {
        url: url,
      },
    });

    if (websiteExists) {
      console.log(`Webpage "${url}" already exists`);

      return;
    } else {
      const text = chunks.join("\n");
      const hashHex = await hash(text);
      const hashExists = await webpage.findOne({
        where: {
          hash: hashHex,
        },
      });
      if (hashExists) {
        console.log(`Website '${url}' have same hash as '${hashExists.url}'`);
        return;
      }

      await tryFunc(
        () =>
          webpage.create({
            hash: hashHex,
            title: title,
            url: url,
            summary: summary,
            sitename: sitename,
          }),
        10,
        `Error while saving webpage "${url}" Retrying...}`,
        `Data for webpage "${url}" could not be saved.`
      );

      // add title to chunks
      for (let i = 0; i < chunks.length; i++) {
        chunks[i] = `${title} part ${i + 1} of ${chunks.length} (${url}):\n${chunks[i]}`;
      }

      let embeddings = [];
      if (chunks.length < maxChunksInsert) {
        embeddings = await extractEmbeddings(chunks);
      } else {
        for (let i = 0; i < chunks.length; i += maxChunksInsert) {
          const c = chunks.slice(i, i + maxChunksInsert);
          const e = await extractEmbeddings(c);
          embeddings.push(...e);
        }
      }
      console.log(`Saving webpage "${url}"`);
      const data = [];
      const pdata = [];
      for (let i = 0; i < chunks.length; i++) {
        const id = url + `-${i + 1}`;
        data.push({
          id: await hash(id),
          pid: id,
          url: url,
          chunk: chunks[i],
        });

        pdata.push({
          id: id,
          values: embeddings[i],
        });
      }

      await tryFunc(
        () => chunk.bulkCreate(data),
        10,
        `Error while saving webpage "${url}" Retrying...`,
        `Data for webpage "${url}" could not be saved.`
      );

      await tryFunc(
        () => index.upsert(pdata),
        10,
        `Error while saving webpage(Vector) "${url}" Retrying...`,
        `Data for webpage(Vector) "${url}" could not be saved.`
      );
    }
  };

  while (1) {
    if (queue.full) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    } else {
      await queue.push(task);
      break;
    }
  }
}

async function query(q, k = 10) {
  if (!initDone) {
    await init();
    initDone = true;
  }

  console.log(`Query: ${q}`);
  const embeddings = await extractEmbeddings(q);
  const results = await index.query({
    vector: embeddings[0],
    topK: k,
  });
  const matches = results.matches;
  console.log(`Number of matches: ${matches.length}`);
  const ids = matches.map((m) => m.id);
  console.log(`Number of ids: ${ids.length}`);
  const chunks = await chunk.findAll({
    where: {
      pid: ids,
    },
  });
  console.log(`Number of chunks: ${chunks.length}`);
  const urls = chunks.map((c) => c.url);
  const webpages = await webpage.findAll({
    where: {
      url: urls,
    },
  });
  console.log(`Number of webpages: ${webpages.length}`);
  const urlMap = {};
  for (let i = 0; i < webpages.length; i++) {
    const w = webpages[i];
    urlMap[w.url] = [w.title, w.summary];
  }

  const searchResults = []; // array of SearchResult objects
  for (let i = 0; i < chunks.length; i++) {
    const c = chunks[i];
    const s = matches[i].score;
    if (!urlMap[c.url]) {
      continue;
    }
    const title = urlMap[c.url][0];
    const summary = urlMap[c.url][1];
    searchResults.push(new SearchResult({ url: c.url, title, chunk: c.chunk, score: s, summary }));
  }

  return searchResults;
}

async function closeDB() {
  if (!initDone) {
    await init();
    initDone = true;
  }

  await sequelize.close();
}

export { saveChunk, query, urlExists, allUrls, closeDB };
