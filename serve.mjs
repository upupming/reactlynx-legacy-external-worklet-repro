import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.join(import.meta.dirname, 'artifacts');
createServer(async (req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  const file = path.resolve(root, `.${pathname}`);
  try {
    if (!file.startsWith(root + path.sep)) throw new Error('Invalid path');
    const data = await readFile(file);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', file.endsWith('.json') ? 'application/json' : 'application/octet-stream');
    res.end(data);
    console.log(res.statusCode, pathname, data.length);
  } catch (error) {
    res.statusCode = 404;
    res.end(String(error));
    console.log(404, pathname);
  }
}).listen(3114, '0.0.0.0', () => console.log('Minimal repro http://10.0.2.2:3114'));
