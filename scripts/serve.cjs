const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../dist');
const port = Number(process.env.BOARD_PORT || 8081);
const mime = {'.html':'text/html; charset=utf-8','.js':'application/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.md':'text/plain; charset=utf-8'};
http.createServer((req,res) => {
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Headers','baggage, sentry-trace');
  res.setHeader('Cache-Control','no-store');
  if(req.method === 'OPTIONS'){res.writeHead(204); return res.end();}
  let relative; try {relative = decodeURIComponent(new URL(req.url,'http://localhost').pathname);} catch {res.writeHead(400); return res.end();}
  const target = path.resolve(root, '.'+ (relative === '/' ? '/index.html' : relative));
  if(!target.startsWith(root+path.sep)){res.writeHead(403); return res.end();}
  fs.readFile(target,(err,data) => {if(err){res.writeHead(404); return res.end('Not found');} res.setHeader('Content-Type',mime[path.extname(target)] || 'application/octet-stream'); res.end(data);});
}).listen(port,'127.0.0.1',() => console.log(`RemNote database board: http://localhost:${port} | preview: http://localhost:${port}/preview.html`));
