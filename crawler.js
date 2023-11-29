import { allUrls } from "./database.js";
import { CheerioCrawler, PuppeteerCrawler } from "crawlee";
import HTMLParser from "./parser.js";
import { saveChunk } from "./database.js";
import fs from "fs";
import dotenv from "dotenv";
dotenv.config();

// const urls = await allUrls();
// const visitedMap = {};
// for (let url of urls) {
//   visitedMap[url] = true;
// }
// console.log(`Loaded ${urls.length} urls`);

const avoidPatterns = [
  ".txt",
  ".doc",
  ".docx",
  ".pdf",
  ".odt",
  ".ods",
  ".odp",
  ".epub",
  ".xls",
  ".xlsx",
  ".ppt",
  ".pptx",
  ".jpg",
  ".jpeg",
  ".png",
  ".bmp",
  ".svg",
  ".gif",
  ".mp3",
  ".mp4",
  ".avi",
  ".mkv",
  ".mov",
  ".wmv",
  ".flv",
  ".wav",
  ".ogg",
  ".webm",
  ".zip",
  ".rar",
  ".7z",
  ".tar.gz",
  ".tar.xz",
  ".tar.bz2",
  ".tar.lz",
  ".tar.lzma",
  ".tar.Z",
  ".tar.sz",
  ".tar.zst",
  ".iso",
  ".dmg",
  ".css",
  ".js",
  ".exe",
  ".dll",
  ".tar",
  ".json",
  ".ini",
  ".tmp",
  ".swp",
  "/wp-admin/",
  "/login",
  "/register",
  "/cgi-bin/",
  "/wp-admin/",
  "/wp-content/",
  "/wp-includes/",
  "/admin/",
  "/signin",
  "/signup",
];

let totalVisited = 0;
let visited = 0;
const chunkSize = process.env.CHUNK_SIZE || 1000;

class Crawler {
  constructor(urls, maxRequestsPerCrawl = 100) {
    this.maxRequestsPerCrawl = maxRequestsPerCrawl;

    if (typeof urls === "string") {
      if (urls.endsWith(".txt")) {
        urls = fs.readFileSync(urls, "utf-8").split("\n");
      } else if (urls.endsWith(".xml")) {
        urls = fs
          .readFileSync(urls, "utf-8")
          .split("\n")
          .map((line) => line.match(/<loc>(.*)<\/loc>/)[1]);
      } else {
        urls = [urls];
      }
    }

    if (urls.length == 1) {
      this.crawler = this.getSingleWebsiteCrawler();
    } else {
      this.crawler = this.getMultiUrlCrawler();
    }

    this.urls = urls;
    console.log(`Crawl: ${urls}`);
  }

  async run() {
    await this.crawler.run(this.urls);
  }

  getSingleWebsiteCrawler() {
    return new CheerioCrawler({
      async requestHandler({ request, $, enqueueLinks, log }) {
        visited++;
        const title = $("title").text();
        const url = request.loadedUrl;
        const html = $.html();
        const parser = new HTMLParser(html, chunkSize);
        parser.parse();
        const chunks = parser.paragraphs;
        log.info(`${url} - ${title}: (${chunks.length}) chunks (${visited}/${totalVisited})`);
        const domain = new URL(url).hostname;
        await saveChunk(title, parser.summary, domain, url, chunks);

        await enqueueLinks({
          transformRequestFunction(req) {
            const url = req.url.toLocaleLowerCase();
            // if (totalVisited > 1000) {
            //   if (visitedMap[url]) {
            //     return false;
            //   }
            // }
            if (avoidPatterns.some((ext) => url.includes(ext))) {
              return false;
            }
            totalVisited++;
            return req;
          },
        });
      },

      maxRequestsPerCrawl: this.maxRequestsPerCrawl,
    });
  }

  getMultiUrlCrawler() {
    return new CheerioCrawler({
      async requestHandler({ request, $, log }) {
        const title = $("title").text();
        const url = request.loadedUrl;
        const domain = new URL(url).hostname;
        const html = $.html();
        const parser = new HTMLParser(html, chunkSize);
        parser.parse();
        const chunks = parser.paragraphs;
        log.info(`${request.loadedUrl} - ${title}: (${chunks.length}) chunks`);
        await saveChunk(title, parser.summary, domain, url, chunks);
      },
    });
  }
}

class PCrawler {
  constructor(urls, maxRequestsPerCrawl = 100) {
    this.maxRequestsPerCrawl = maxRequestsPerCrawl;

    if (typeof urls === "string") {
      if (urls.endsWith(".txt")) {
        urls = fs.readFileSync(urls, "utf-8").split("\n");
      } else if (urls.endsWith(".xml")) {
        urls = fs
          .readFileSync(urls, "utf-8")
          .split("\n")
          .map((line) => line.match(/<loc>(.*)<\/loc>/)[1]);
      } else {
        urls = [urls];
      }
    }

    if (urls.length == 1) {
      this.crawler = this.getSingleWebsiteCrawler();
    } else {
      this.crawler = this.getMultiUrlCrawler();
    }

    this.urls = urls;
    console.log(`Crawl: ${urls}`);
  }

  async run() {
    await this.crawler.run(this.urls);
  }

  getSingleWebsiteCrawler() {
    return new PuppeteerCrawler({
      launchContext: {
        launchOptions: {
          headless: process.env.CRAWLEE_HEADLESS !== "false",
        },
      },
      async requestHandler({ request, page, log, enqueueLinks }) {
        visited++;
        const title = await page.title();
        const html = await page.content();
        const parser = new HTMLParser(html, chunkSize);
        parser.parse();
        const chunks = parser.paragraphs;
        log.info(`${request.loadedUrl} - ${title}: (${chunks.length}) chunks (${visited}/${totalVisited})`);
        const url = request.loadedUrl;
        const domain = new URL(url).hostname;
        await saveChunk(title, parser.summary, domain, url, chunks);

        await enqueueLinks({
          transformRequestFunction(req) {
            const url = req.url;
            totalVisited++;

            // if (!url.includes("r/history/comments")) {
            //   return false;
            // }

            // if (totalVisited > 1000) {
            //   if (visitedMap[url]) {
            //     return false;
            //   }
            // }


            if (avoidPatterns.some((ext) => url.includes(ext))) {
              return false;
            }
            return req;
          },
        });
      },

      maxRequestsPerCrawl: this.maxRequestsPerCrawl,
    });
  }

  getMultiUrlCrawler() {
    return new PuppeteerCrawler({
      async requestHandler({ request, page, log }) {
        const title = await page.title();
        const url = request.loadedUrl;
        const html = await page.content();
        const parser = new HTMLParser(html, chunkSize);
        parser.parse();
        const chunks = parser.paragraphs;
        log.info(`${request.loadedUrl} - ${title}: (${chunks.length}) chunks`);

        await saveChunk(title, parser.summary, parser.sitename, url, chunks);
      },
    });
  }
}

const args = process.argv.slice(2);
if (require.main === module) {
  if (args.length == 0) {
    let text = `Usage: node crawler.js <url> [maxRequestsPerCrawl] [crawlerType]\n\n`;
    text += `Parameters:\n`;
    text += `  url: URL to crawl\n`;
    text += `  maxRequestsPerCrawl: Maximum number of requests per crawl. Default: 100\n`;
    text += `  crawlerType: Type of crawler. Default: cheerio\n`;
    text += `    cheerio: Uses cheerio crawler\n`;
    text += `    puppeteer: Uses puppeteer crawler\n`;
    console.log(text);

    process.exit(1);
  }

  const url = args[0];
  let maxRequestsPerCrawl = 100;
  let crawlerType = "cheerio";

  if (args.length > 1) {
    maxRequestsPerCrawl = parseInt(args[1]);
  }
  if (args.length > 2) {
    crawlerType = args[2];
  }

  if (crawlerType == "cheerio") {
    const crawler = new Crawler(url, maxRequestsPerCrawl);
    await crawler.run();
  } else {
    const crawler = new PCrawler(url, maxRequestsPerCrawl);
    await crawler.run();
  }
}

export { Crawler, PCrawler}
