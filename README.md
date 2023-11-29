![Search Engine](https://github.com/shhossain/simple_search_engine/blob/main/searchengine_front.jpg?raw=true)

# Simple JavaScript Search Engine

This is a straightforward JavaScript search engine complete with a crawler, database integration, and a basic web server to facilitate search functionality.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Configuration](#configuration)
- [Running the Application](#running-the-application)
- [Usage](#usage)
- [Contributing](#contributing)
- [License](#license)

## Prerequisites

Before you dive in, make sure you meet the following requirements:

- **Node.js and npm:** Ensure that you have Node.js and npm installed.
- **Database:** Have a database (e.g., MySQL) installed and running.
- **Pinecone API Key:** Obtain a Pinecone API key for storing embeddings.

## Running without any configuration (simplest way)

### Installation

- Install [Node.js](https://nodejs.org/en/download/).
- Install [XAMPP](https://www.apachefriends.org/download.html) or any other MySQL server.

### Configuration

1. Start the MySQL server.
2. Create a database with any name.
3. Sign up at [Pinecone](https://www.pinecone.io/) and obtain your API key and environment name.
4. Clone the repository:

   ```bash
   git clone https://github.com/shhossain/simple_search_engine
   ```

5. Navigate to the root of your project.

   ```bash
   cd simple_search_engine
   ```

6. Create a `.env` file in the project's root with the following content:

   ```dotenv
   PINECONE_API_KEY=your_pinecone_api_key
   PINECONE_ENVIRONMENT=your_pinecone_environment
   DATABASE_NAME=your_database_name
   ```

### Running the Application

Run the following commands in the root of your project:

```bash
npm install
```

#### Crawl some sites

```bash
node crawl.js https://www.example.com
```

**Note:** Normally, a maximum of 100 pages will be crawled. You can add -1 to crawl all pages (e.g., `node crawl.js https://www.example.com -1`).

#### Start the server

```bash
node server.js
```
### Demo

![Search Engine](https://github.com/shhossain/simple_search_engine/blob/main/searchengine_front.jpg?raw=true)
![Search Results](https://github.com/shhossain/simple_search_engine/blob/main/searchengine_search.jpg?raw=true)

The application should now be accessible at [http://localhost:3000](http://localhost:3000).

## Full Configuration

Adjust the following configurations in the `.env` file:

```dotenv
# Database Configuration
DATABASE_NAME=sifat
DATABASE_USER=root
DATABASE_PASSWORD=""
DATABASE_HOST=localhost
DATABASE_PORT="3306"
DATABASE_DIALECT=mysql

# Pinecone Configuration
PINECONE_API_KEY=your_pinecone_api_key
PINECONE_ENVIRONMENT=your_pinecone_environment

# PINECONE_INDEX_NAME=website
# PINECONE_DIMENSION=384
# PINECONE_METRIC=cosine

# Embedding Model Configuration
# MODEL_NAME=Xenova/all-MiniLM-L6-v2

# Crawler Configuration
# CHUNK_SIZE=1000
# CRAWLEE_HEADLESS=true

# Search Engine Configuration
# MAX_RESULTS=100
# MAX_CHUNKS_INSERT=30
```

## Advanced Configuration

### For Crawling

Adjust the crawler configuration by modifying settings in `crawler.js` and `crawl.js` files. The application uses [Crawlee](https://crawlee.dev/) for crawling.

### For Ranking

Modify the ranking algorithm (a simplistic approach is currently implemented) by editing the `classes.js` file.

### For Database

Change the database configuration by editing the `database.js` file.

### For Parsing

Customize how HTML pages are parsed by modifying the `parser.js` file.

### For Server

The application uses Express.js for the server with the EJS template engine. Customize the behavior by editing the `server.js` file.

## Contributing

Contributions are welcome! Please follow the [contribution guidelines](CONTRIBUTING.md).

## License

This project is licensed under the [Apache License 2.0](LICENSE).
