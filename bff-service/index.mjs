import http from 'http';
import { Readable } from 'stream';
import dotenv from 'dotenv';
// import fetch from 'node-fetch'; // Uncomment if using Node.js < 18 and install 'node-fetch'

dotenv.config();

const PORT = process.env.PORT || 3000;
const serviceMap = {
  product: process.env.PRODUCT_SERVICE_URL,
  cart: process.env.CART_SERVICE_URL,
};

const productListCache = new Map();
const CACHE_KEY_PRODUCT_LIST = 'getProductsList';
const CACHE_TTL_MS = 2 * 60 * 1000; // 2 minutes in milliseconds

const hopByHopHeaders = [
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailers',
  'transfer-encoding',
  'upgrade',
  'host',
];

function filterHeaders(headers, headersToExclude) {
    const filtered = {};
    for (const key in headers) {
        if (Object.prototype.hasOwnProperty.call(headers, key)) {
            const lowerKey = key.toLowerCase();
            const headerValue = headers[key];
            if (!headersToExclude.includes(lowerKey) && headerValue) {
                filtered[key] = Array.isArray(headerValue) ? headerValue.join(', ') : headerValue;
            }
        }
    }
    return filtered;
}

const server = http.createServer(async (req, res) => {
  if (!req.url) {
    console.error('Error: Missing req.url in request');
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ code: 400, message: 'Bad Request: Missing URL' }));
    return;
  }

  const urlParts = req.url.split('?');
  const path = urlParts[0];
  const queryString = urlParts[1] ? `?${urlParts[1]}` : '';

  const pathSegments = path.split('/').filter(Boolean);

  if (pathSegments.length === 0) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ message: 'BFF Service is running' }));
    return;
  }

  const serviceName = pathSegments[0];
  const pathParts = pathSegments.slice(1);
  const targetServiceURL = serviceMap[serviceName];

  if (!targetServiceURL) {
    console.warn(`Service not found for: ${serviceName} (missing configured URL)`);
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ code: 502, message: "Cannot process request" }));
    return;
  }

  const basePath = targetServiceURL.replace(/\/$/, '');
  const pathSuffix = pathParts.join('/');
  const downstreamUrl = `${basePath}/${pathSuffix}${queryString}`;

  const filteredClientHeaders = filterHeaders(req.headers, hopByHopHeaders);

  const method = req.method || 'GET';

  const isGetProductList = method === 'GET' && serviceName === 'product' && pathSuffix === '';

  if (isGetProductList) {
    const cachedData = productListCache.get(CACHE_KEY_PRODUCT_LIST);
    const now = Date.now();

    if (cachedData && (now - cachedData.timestamp < CACHE_TTL_MS)) {
      console.log(`Cache HIT for ${CACHE_KEY_PRODUCT_LIST}`);
      res.writeHead(cachedData.statusCode, cachedData.headers);
      res.end(cachedData.body);
      return;
    }
    console.log(`Cache MISS or EXPIRED for ${CACHE_KEY_PRODUCT_LIST}`);
  }

  /** @type {RequestInit} */
  const options = {
    method: method,
    headers: filteredClientHeaders,
    redirect: 'manual',
  };


  try {
    if (method !== 'GET' && method !== 'HEAD' && (req.headers['content-length'] || req.headers['transfer-encoding'])) {
       options.body = req;
       options.duplex = 'half';
    }

    console.log(`Proxying request: ${method} ${downstreamUrl}`);
    const response = await fetch(downstreamUrl, options);
    console.log(`Received response: ${response.status} from ${downstreamUrl}`);

    if (!response.ok) {
        const errorBodyText = await response.text();
        console.warn(`Error from downstream service (${response.status}): ${errorBodyText}`);
        res.writeHead(response.status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ code: response.status, message: errorBodyText }));
        return;
    }

    const responseHeaders = {};
    response.headers.forEach((value, name) => {
        responseHeaders[name.toLowerCase()] = value;
    });
    const filteredResponseHeaders = filterHeaders(responseHeaders, hopByHopHeaders);

    if (isGetProductList) {
        const responseBodyText = await response.text();
        const cacheEntry = {
            statusCode: response.status,
            headers: filteredResponseHeaders,
            body: responseBodyText,
            timestamp: Date.now()
        };
        productListCache.set(CACHE_KEY_PRODUCT_LIST, cacheEntry);
        console.log(`Cached response for ${CACHE_KEY_PRODUCT_LIST}`);

        res.writeHead(cacheEntry.statusCode, cacheEntry.headers);
        res.end(cacheEntry.body);
    } else {
        res.writeHead(response.status, filteredResponseHeaders);
        if (response.body) {
            const nodeStream = Readable.fromWeb(response.body);
            nodeStream.pipe(res);
            nodeStream.on('error', (streamErr) => {
                console.error(`Error streaming successful response from ${downstreamUrl}:`, streamErr);
                if (!res.writableEnded) {
                    res.end();
                }
            });
        } else {
            res.end();
        }
    }

  } catch (err) {
    console.error(`Error during proxy connection to ${downstreamUrl}:`, err);
    if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
    }
    if (!res.writableEnded) {
        res.end(JSON.stringify({ code: 500, message: 'Internal Server Error during proxy request' }));
    }
  }
});

server.listen(PORT, () => {
  console.log(`BFF running on http://localhost:${PORT}`);
  console.log('Configured services:');
  for (const [name, url] of Object.entries(serviceMap)) {
    console.log(`  - ${name}: ${url || 'NOT CONFIGURED!'}`);
  }
});
