import * as fuzz from "fuzzball";

class SearchResult {
  constructor({ url, title, chunk, score, summary }) {
    this.url = url;
    this.firstResult = false;

    this.domain = new URL(url).hostname;
    this.title = title;
    this.chunk = chunk;
    this.score = score;
    this.summary = summary;
    this.path = this.pathText();
  }

  pathText() {
    let txt = "";
    const url = new URL(this.url);
    txt += url.hostname;
    const parts = url.pathname.split("/");
    let j = 0;
    for (let i = 0; i < parts.length; i++) {
      if (j > 2) {
        break;
      }
      const p = parts[i];
      if (p.match(/\.(html|htm|php|asp)$/)) {
        break;
      }
      let ttxt = txt;
      if (p) {
        ttxt += ` › ${p}`;
      }
      if (ttxt.length > 50) {
        txt += ` › ...`;
        break;
      } else {
        txt = ttxt;
      }

      j++;
    }

    return txt;
  }

  inspect(depth, opts) {
    return `SearchResult { url: ${this.url}, domain: ${this.domain}, title: ${this.title}, summary: ${this.summary}, score: ${this.score} }`;
  }
}


class FirstSearchResult extends SearchResult {
  constructor({ url, title, chunk, score, summary, searchResults }) {
    super({ url, title, chunk, score, summary });
    this.searchResults = searchResults;
    this.firstResult = true;
  }
}

function sameDomain(url1, url2) {
  url1 = "https://" + url1 + "/";
  url2 = "https://" + url2 + "/";

  let u1 = new URL(url1);
  let u2 = new URL(url2);
  u1.hostname = u1.hostname.replace(/^www\./, "");
  u2.hostname = u2.hostname.replace(/^www\./, "");

  let parts1 = u1.hostname.split(".");
  let parts2 = u2.hostname.split(".");

  let d1 = parts1.slice(-2).join(".");
  let d2 = parts2.slice(-2).join(".");
  return d1 == d2;
}

class Ranker {
  constructor(searchResults, query) {
    this.searchResults = searchResults;
    this.query = query;
  }

  rank() {
    const query = this.query.toLowerCase();
    let results = this.searchResults;
    const urlMap = {};
    results = results.filter((r) => {
      const url = r.url.toLowerCase();
      if (urlMap[url]) {
        return false;
      } else {
        urlMap[url] = true;
        return true;
      }
    });

    let rankedResults = results.map((r) => {
      const uurl = new URL(r.url);
      const url = r.url.toLowerCase();
      const title = r.title.toLowerCase();
      const chunk = r.chunk.toLowerCase();
      let score = r.score;

      const s1 = fuzz.partial_ratio(url, query);
      const s2 = fuzz.partial_ratio(title, query);

      if (s1 > 80) {
        score += 0.1 * (s1 / 100);
      }
      if (s2 > 80) {
        score += 0.1 * (s2 / 100);
      }
      if (r.summary && r.summary.toLowerCase().includes(query)) {
        score += 0.2;
      }

      let chunks = chunk.split("\n");
      let sm = "";
      let fsm = "";
      let smScore = 0;
      for (let i = 0; i < chunks.length; i++) {
        let c = chunks[i];
        let lines = c.split("\n");
        lines.shift();
        lines = lines.map((l) => l.replace(/<[^>]+>/g, ""));
        c = lines.join("\n");
        if (c.length < 10) {
          continue;
        }

        const cc = c.toLowerCase();
        if (fuzz.partial_ratio(cc, query) > 80) {
          score += 0.01;
          smScore++;

          if (fsm.length == 0 && c.length > 50) {
            fsm = c;
          }
        }

        if (sm.length == 0 && c.length > 50) {
          let qparts = query.split(" ");
          let ic = 0;
          for (let j = 0; j < qparts.length; j++) {
            const p = qparts[j];
            if (cc.includes(p)) {
              ic++;
              break;
            }
          }

          if (ic) {
            sm = c;
          }
        }
      }

      if (uurl.search || uurl.hash) {
        score -= 0.1;
      }

      if (title.length > 50) {
        let val = title.length / 50;
        score -= 0.05 * val;
      }

      if (urlMap[url]) {
        score -= 0.1;
      } else {
        urlMap[url] = true;
      }

      if (smScore == 0) {
        score -= 0.05;
      }

      if (sm.length > 10) {
        r.summary = sm;
      } else if (!r.summary || r.summary.length < 20) {
        r.summary = fsm;
      }

      if (!r.summary) {
        r.summary = "";
        score -= 0.2;
      }

      r.summary = r.summary.replace(/\[\d+\]/g, "");

      return new SearchResult({ ...r, score });
    });

    rankedResults.sort((a, b) => b.score - a.score);

    // get first result
    const firstDomain = rankedResults[0].domain;
    const firstResults = rankedResults.filter((r) => sameDomain(r.domain, firstDomain));
    rankedResults = rankedResults.filter((r) => !sameDomain(r.domain, firstDomain));
    rankedResults.unshift(
      new FirstSearchResult({
        ...firstResults[0],
        searchResults: firstResults,
      })
    );

    return rankedResults;
  }
}

export { SearchResult, Ranker, sameDomain };
