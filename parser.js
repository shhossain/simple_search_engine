import { JSDOM, VirtualConsole } from "jsdom";
import { Readability } from "@mozilla/readability";
import natural from "natural";


const sentenceTokenizer = new natural.SentenceTokenizer();

class HTMLParser {
  constructor(html, chunkSize = 1000) {
    const virtualConsole = new VirtualConsole();
    virtualConsole.on("error", () => {});
    this.dom = new JSDOM(html, { virtualConsole });

    this.chunkSize = chunkSize;
    this.paragraphs = [];
    this.title = "";
    this.summary = "";
    this.sitename = "";
  }

  getArticle() {
    const reader = new Readability(this.dom.window.document);
    const article = reader.parse();
    return article;
  }

  parse() {
    const article = this.getArticle();
    this.title = article.title;
    this.summary = article.excerpt;
    this.sitename = article.siteName;

    const txt = article.textContent;
    let paragraphs = txt.split("\n\n");
    paragraphs = paragraphs.map((p) => p.trim().replace("\t", " ").replace("  ", " ").trim());
    paragraphs = paragraphs.filter((p) => p.length > 0);

    let newParagraphs = [];
    for (let i = 0; i < paragraphs.length; i++) {
      const p = paragraphs[i];
      const sentences = sentenceTokenizer.tokenize(p);
      if (sentences.length == 1) {
        newParagraphs.push(p + "\n" + paragraphs[i + 1]);
        i++;
      } else {
        newParagraphs.push(p);
      }
    }
    paragraphs = newParagraphs;
    newParagraphs = [];
    let chunk = "";
    for (let i = 0; i < paragraphs.length; i++) {
      const p = paragraphs[i];
      if (chunk.length + p.length > this.chunkSize) {
        newParagraphs.push(chunk);
        chunk = "";
      }
      chunk += p + "\n";
    }

    if (chunk.length > 5) {
      newParagraphs.push(chunk);
    }

    this.paragraphs = newParagraphs;
  }
}

export default HTMLParser;
