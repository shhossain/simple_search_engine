import express from "express";
import path from "path";
import { query } from "./database.js";
import { Ranker, sameDomain } from "./classes.js";
import {Crawler} from "./crawler.js";
import dotenv from "dotenv";
dotenv.config();

const maxResults = process.env.MAX_RESULTS || 100;

const searchResults = new Map(); // query: [SearchResult]
async function search(q) {
  if (searchResults[q]) {
    return searchResults[q];
  }

  const results = await query(q, maxResults);
  const rankedResults = new Ranker(results, q).rank();
  searchResults[q] = rankedResults;

  if (searchResults.size > 20) {
    const at = searchResults.keys().next().value;
    searchResults.delete(at);
  }
  return rankedResults;
}

const app = express();
app.set("view engine", "ejs");
const __dirname = path.resolve();
const perPage = 30;

app.use(express.static(path.join(__dirname, "web")));
app.set("views", path.join(__dirname, "web"));
app.use(express.json());

// Define routes
app.get("/", (req, res) => {
  res.render("index");
});

app.get("/search", async (req, res) => {
  const query = req.query.q || "";
  if (query === "") {
    res.render("index");
    return;
  }
  const dm = req.query.dm || "";
  let results = await search(query);
  let copyResults = results.map((r) => ({ ...r }));
  const first = results[0];
  if (dm) {
    if (first.firstResult) {
      results = first.searchResults;
    } else {
      results = results.filter((r) => sameDomain(r.url, dm));
    }
  } else {
    if (first.firstResult) {
      copyResults[0].searchResults = copyResults[0].searchResults.slice(1, 4);
      results = copyResults;
    }
  }

  const page = req.query.page || 1;
  const start = (page - 1) * perPage;
  const end = start + perPage;
  const total = results.length;
  const totalPages = Math.ceil(total / perPage);
  const pages = [];
  for (let i = 1; i <= totalPages; i++) {
    pages.push(i);
  }
  const resultsPage = results.slice(start, end);
  const data = {
    query,
    results: resultsPage,
    page,
    pages,
    totalPages,
  };

  res.render("search", { query, data });
});

let crawlUrl = "";
app.post("/crawl", async (req, res) => {
  if (crawlUrl) {
    res.json({ errorMessage: `Mupltiple crawings is not allowed. Currently crawling ${crawlUrl}`, successMessage: "" });
    return;
  }

  const url = req.body.url || "";
  if (url === "") {
    res.json({ errorMessage: "Empty URL.", successMessage: "" });
    return;
  }

  crawlUrl = url;

  try {
    const crawler = new Crawler(url, 100);
    await crawler.run();
    crawlUrl = "";
    res.json({ errorMessage: "", successMessage: "Crawling completed." });
  } catch (error) {
    console.error("Crawling error:", error);
    crawlUrl = ""; // Make sure to reset crawlUrl in case of an error
    res.json({ errorMessage: "Crawling error.", successMessage: "" });
  }
});

// Start the server
const port = 3000;
app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
