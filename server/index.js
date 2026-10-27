import http from 'http';
import { handleEnquiryApi } from './enquiry-handler.js';

const PORT = process.env.PORT || 3001;

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (url.pathname === '/api/enquiries') {
    handleEnquiryApi(req, res);
  } else if (url.pathname === '/health') {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ status: 'ok', service: 'ashziz-api' }));
  } else {
    res.statusCode = 404;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ ok: false, error: 'Not Found' }));
  }
});

server.listen(PORT, () => {
  console.log(`[ASHZIZ API Server] Listening on http://localhost:${PORT}`);
});

export { server };

