// Warning: This file will delete all records from pinecone and mysql database

import { Pinecone } from "@pinecone-database/pinecone";
import { Sequelize, DataTypes } from "sequelize";
import dotenv from "dotenv";
dotenv.config();


function uuid() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
    var r = (Math.random() * 16) | 0,
      v = c == "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

const config = {
  apiKey: process.env.PINECONE_API_KEY,
  environment: process.env.PINECONE_ENVIRONMENT,
};

async function deleteIndex() {
  console.log("Setting up pinecone");
  let pinecone = new Pinecone(config);
  let index = pinecone.index("website");

  let result = await index.describeIndexStats();
  console.log(result);
  const dim = result.dimension;
  const total = result.totalRecordCount;
  if (total == 0) {
    console.log("All records deleted");
    return;
  }

  console.log("Deleting all records");
  const vec = Array(dim).fill(0);
  const results = await index.query({
    vector: vec,
    topK: total,
  });

  const ids = results.matches.map((m) => m.id);
  const chunkSize = 1000;
  const chunks = [];
  for (let i = 0; i < ids.length; i += chunkSize) {
    chunks.push(ids.slice(i, i + chunkSize));
  }

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    console.log(`Deleting chunk ${i + 1}`);
    await index.deleteMany(chunk);
  }

  pinecone = new Pinecone(config);
  index = pinecone.index("website");

  result = await index.describeIndexStats();
  if (result.totalRecordCount == 0) {
    console.log("All records deleted");
  } else {
    console.log("Failed to delete all records");
  }
  console.log(result);
}

// deleting mysql records
async function deleteMySQL() {
  console.log("Deleting mysql records");
  const sequelize = new Sequelize("sifat", "root", "", {
    dialect: "mysql",
    host: "localhost",
    logging: false,
  });

  try {
    await sequelize.authenticate();
    console.log("Connection has been established successfully.");
  } catch (error) {
    console.error("Unable to connect to the database:", error);
  }

  const chunk = sequelize.define("chunks", {
    id: {
      type: DataTypes.STRING,
      primaryKey: true,
    },
    url: DataTypes.STRING,
    chunk: DataTypes.TEXT,
  });

  const webpage = sequelize.define("webpages", {
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

  await chunk.destroy({
    where: {},
    truncate: true,
  });

  await webpage.destroy({
    where: {},
    truncate: true,
  });

  let count = await chunk.count();
  count += await webpage.count();
  if (count == 0) {
    console.log("All mysql records deleted");
  } else {
    console.log("Failed to delete all mysql records");
  }

  sequelize.close();
}

await deleteIndex();
await deleteMySQL();
