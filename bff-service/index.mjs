import http from 'http';
import { Readable } from 'stream';
import dotenv from 'dotenv';
// Zamiast importować 'node-fetch', użyjemy globalnego fetch dostępnego w nowszych Node.js
// Jeśli używasz starszej wersji Node.js (<18), odkomentuj poniższą linię i zainstaluj 'node-fetch':
// import fetch from 'node-fetch';

dotenv.config(); // Wczytuje zmienne z pliku .env (lokalnie)

const PORT = process.env.PORT || 3000;
const serviceMap = {
  product: process.env.PRODUCT_SERVICE_URL,
  cart: process.env.CART_SERVICE_URL,
  // Możesz dodać więcej usług tutaj
};

// --- CACHE ---
const productListCache = new Map();
const CACHE_KEY_PRODUCT_LIST = 'getProductsList';
const CACHE_TTL_MS = 2 * 60 * 1000; // 2 minuty w milisekundach
// -------------

// Nagłówki typu hop-by-hop, które nie powinny być przekazywane dalej
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

// Funkcja pomocnicza do filtrowania nagłówków
/**
 * Filtruje nagłówki hop-by-hop.
 * @param {http.IncomingHttpHeaders | Record<string, string>} headers - Nagłówki wejściowe.
 * @param {string[]} headersToExclude - Nagłówki do wykluczenia.
 * @returns {Record<string, string>} - Przefiltrowane nagłówki.
 */
function filterHeaders(headers, headersToExclude) {
    const filtered = {};
    for (const key in headers) {
        if (Object.prototype.hasOwnProperty.call(headers, key)) {
            const lowerKey = key.toLowerCase();
            const headerValue = headers[key];
            if (!headersToExclude.includes(lowerKey) && headerValue) {
                // Upewnijmy się, że wartość jest stringiem (chociaż IncomingHttpHeaders zwykle ma string | string[])
                filtered[key] = Array.isArray(headerValue) ? headerValue.join(', ') : headerValue;
            }
        }
    }
    return filtered;
}


const server = http.createServer(async (req, res) => {
  // Sprawdzenie czy req.url istnieje
  if (!req.url) {
    console.error('Błąd: Brak req.url w żądaniu');
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ code: 400, message: 'Bad Request: Missing URL' }));
    return;
  }

  // Rozdzielenie ścieżki od query string
  const urlParts = req.url.split('?');
  const path = urlParts[0];
  const queryString = urlParts[1] ? `?${urlParts[1]}` : '';

  // Podział ścieżki na segmenty, pomijając puste
  const pathSegments = path.split('/').filter(Boolean);

  if (pathSegments.length === 0) {
    // Obsługa żądania do roota
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ message: 'BFF Service is running' }));
    return;
  }

  const serviceName = pathSegments[0];
  const pathParts = pathSegments.slice(1);
  const targetServiceURL = serviceMap[serviceName];

  // --- REALIZACJA WYMAGANIA 1 (z kodem błędu w message) ---
  if (!targetServiceURL) {
    console.warn(`Nie znaleziono usługi dla: ${serviceName} (brak skonfigurowanego URL)`);
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ code: 502, message: "Cannot process request" }));
    return;
  }
  // --- KONIEC REALIZACJI WYMAGANIA 1 ---

  // Budowanie pełnego URL do mikroserwisu - unikanie podwójnych ukośników
  const basePath = targetServiceURL.replace(/\/$/, ''); // Usuń końcowy '/' jeśli istnieje
  const pathSuffix = pathParts.join('/');
  const downstreamUrl = `${basePath}/${pathSuffix}${queryString}`;

  // Przetwarzanie nagłówków żądania
  const filteredClientHeaders = filterHeaders(req.headers, hopByHopHeaders);

  const method = req.method || 'GET';

  // --- LOGIKA CACHE ---
  // Sprawdź, czy to żądanie GET do listy produktów
  const isGetProductList = method === 'GET' && serviceName === 'product' && pathSuffix === '';

  if (isGetProductList) {
    const cachedData = productListCache.get(CACHE_KEY_PRODUCT_LIST);
    const now = Date.now();

    // Sprawdź, czy cache istnieje i jest ważny
    if (cachedData && (now - cachedData.timestamp < CACHE_TTL_MS)) {
      console.log(`Cache HIT for ${CACHE_KEY_PRODUCT_LIST}`);
      // Ustaw nagłówki z cache
      res.writeHead(cachedData.statusCode, cachedData.headers);
      // Wyślij ciało z cache
      res.end(cachedData.body);
      return; // Zakończ przetwarzanie
    }
    console.log(`Cache MISS or EXPIRED for ${CACHE_KEY_PRODUCT_LIST}`);
  }
  // --- KONIEC LOGIKI CACHE (sprawdzanie) ---

  // --- DODANO KOMENTARZ JSDOC ---
  /** @type {RequestInit} */
  const options = {
    method: method,
    headers: filteredClientHeaders, // Użyj przefiltrowanych nagłówków
    redirect: 'manual',
  };
  // --- KONIEC DODANEGO KOMENTARZA ---


  try {
    // Obsługa ciała żądania - strumieniowanie
    if (method !== 'GET' && method !== 'HEAD' && (req.headers['content-length'] || req.headers['transfer-encoding'])) {
       options.body = req;
       options.duplex = 'half';
    }

    console.log(`Proxying request: ${method} ${downstreamUrl}`);
    // Linia 133 (lub zbliżona) - wywołanie fetch
    const response = await fetch(downstreamUrl, options);
    console.log(`Received response: ${response.status} from ${downstreamUrl}`);

    // --- Obsługa błędów z usługi docelowej (buforowanie) ---
    if (!response.ok) {
        const errorBodyText = await response.text();
        console.warn(`Błąd z usługi docelowej (${response.status}): ${errorBodyText}`);
        res.writeHead(response.status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ code: response.status, message: errorBodyText }));
        return;
    }
    // --- Koniec obsługi błędów ---

    // --- Obsługa udanej odpowiedzi ---
    // Pobierz nagłówki odpowiedzi z usługi docelowej
    const responseHeaders = {};
    response.headers.forEach((value, name) => {
        responseHeaders[name.toLowerCase()] = value; // Zapisz nagłówki (małymi literami dla łatwiejszego dostępu)
    });
    const filteredResponseHeaders = filterHeaders(responseHeaders, hopByHopHeaders);

    // Jeśli to była udana odpowiedź GET dla listy produktów, zbuforuj i zapisz w cache
    if (isGetProductList) {
        const responseBodyText = await response.text(); // Zbuforuj ciało odpowiedzi
        const cacheEntry = {
            statusCode: response.status,
            headers: filteredResponseHeaders,
            body: responseBodyText,
            timestamp: Date.now()
        };
        productListCache.set(CACHE_KEY_PRODUCT_LIST, cacheEntry);
        console.log(`Cached response for ${CACHE_KEY_PRODUCT_LIST}`);

        // Wyślij zbuforowaną odpowiedź do klienta
        res.writeHead(cacheEntry.statusCode, cacheEntry.headers);
        res.end(cacheEntry.body);
    } else {
        // Dla innych udanych żądań - strumieniuj odpowiedź
        res.writeHead(response.status, filteredResponseHeaders); // Ustaw status i przefiltrowane nagłówki
        if (response.body) {
            const nodeStream = Readable.fromWeb(response.body);
            nodeStream.pipe(res);
            nodeStream.on('error', (streamErr) => {
                console.error(`Błąd podczas strumieniowania udanej odpowiedzi z ${downstreamUrl}:`, streamErr);
                if (!res.writableEnded) {
                    res.end();
                }
            });
        } else {
            res.end();
        }
    }
    // --- Koniec obsługi udanej odpowiedzi ---

  } catch (err) {
    // Obsługa błędów połączenia z usługą docelową (np. ECONNREFUSED, timeout)
    console.error(`Błąd podczas proxy (połączenia) do ${downstreamUrl}:`, err);
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
