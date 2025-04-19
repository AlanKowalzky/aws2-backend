import http from 'http';
import { Readable } from 'stream'; // <--- DODANO: Import Readable do konwersji strumieni
import dotenv from 'dotenv';
// Zamiast importować 'node-fetch', użyjemy globalnego fetch dostępnego w nowszych Node.js
// Jeśli używasz starszej wersji Node.js (<18), odkomentuj poniższą linię i zainstaluj 'node-fetch':
// import fetch from 'node-fetch';

dotenv.config();

const PORT = process.env.PORT || 3000;
const serviceMap = {
  product: process.env.PRODUCT_SERVICE_URL,
  cart: process.env.CART_SERVICE_URL,
  // Możesz dodać więcej usług tutaj
};

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
  // Dodaj 'host' tutaj, aby go również filtrować przy przekazywaniu nagłówków odpowiedzi
  // Chociaż zwykle nie jest to nagłówek hop-by-hop, nie chcemy go przekazywać z downstream
  'host',
];

const server = http.createServer(async (req, res) => {
  // Sprawdzenie czy req.url istnieje
  if (!req.url) {
    console.error('Błąd: Brak req.url w żądaniu');
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ message: 'Bad Request: Missing URL' }));
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

  if (!targetServiceURL) {
    console.warn(`Nie znaleziono usługi dla: ${serviceName}`);
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ message: `Cannot process request: Service '${serviceName}' not found or configured` }));
    return;
  }

  // Budowanie pełnego URL do mikroserwisu - unikanie podwójnych ukośników
  const basePath = targetServiceURL.replace(/\/$/, ''); // Usuń końcowy '/' jeśli istnieje
  const pathSuffix = pathParts.join('/');
  const downstreamUrl = `${basePath}/${pathSuffix}${queryString}`;

  // Przetwarzanie nagłówków żądania
  const fetchHeaders = {};
  for (const key in req.headers) {
    const lowerKey = key.toLowerCase();
    // Filtruj nagłówki hop-by-hop oraz 'host'
    if (!hopByHopHeaders.includes(lowerKey)) { // 'host' jest już w hopByHopHeaders
      fetchHeaders[key] = req.headers[key];
    }
  }

  const method = req.method || 'GET';

  const options = {
    method: method,
    headers: fetchHeaders,
    redirect: 'manual', // Nie podążaj za przekierowaniami automatycznie
  };

  try {
    // Obsługa ciała żądania - strumieniowanie
    if (method !== 'GET' && method !== 'HEAD' && (req.headers['content-length'] || req.headers['transfer-encoding'])) {
       options.body = req; // Przekaż strumień żądania jako ciało
       // @ts-ignore
       options.duplex = 'half'; // Wymagane dla strumieniowania ciała w fetch
    }

    console.log(`Proxying request: ${method} ${downstreamUrl}`);
    const response = await fetch(downstreamUrl, options);
    console.log(`Received response: ${response.status} from ${downstreamUrl}`);

    // Przekazywanie statusu i nagłówków odpowiedzi
    res.statusCode = response.status;
    response.headers.forEach((value, name) => {
      const lowerName = name.toLowerCase();
      if (!hopByHopHeaders.includes(lowerName)) { // Filtruj nagłówki hop-by-hop
        res.setHeader(name, value);
      }
    });

    // Strumieniowanie odpowiedzi - Z POPRAWKĄ
    if (response.body) {
      // <--- POPRAWKA: Konwertuj Web Stream na Node.js Readable Stream ---
      const nodeStream = Readable.fromWeb(response.body);
      nodeStream.pipe(res);
      // Obsługa błędów strumienia odpowiedzi (opcjonalnie, ale zalecane)
      nodeStream.on('error', (streamErr) => {
        console.error(`Błąd podczas strumieniowania odpowiedzi z ${downstreamUrl}:`, streamErr);
        if (!res.writableEnded) {
          res.end(); // Zakończ odpowiedź, jeśli wystąpił błąd strumienia
        }
      });
    } else {
      res.end(); // Zakończ odpowiedź, jeśli nie ma ciała
    }

  } catch (err) {
    console.error(`Błąd podczas proxy do ${downstreamUrl}:`, err);
    if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
    }
    if (!res.writableEnded) {
        res.end(JSON.stringify({ message: 'Internal Server Error during proxy request' }));
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
